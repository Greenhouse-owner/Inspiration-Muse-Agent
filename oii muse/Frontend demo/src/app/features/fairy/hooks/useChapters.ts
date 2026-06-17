// useChapters — 章节相关：state + 生成 + 删除 + 插入。
//
// 范围：
//   - state: chapters / chapterBusy
//   - 生成: generateChapters(count)（输入"3" 触发）
//   - 单章删除: handleDeleteChapter（前端纯本地操作）
//   - 单章插入: handleInsertChapterAfter（调后端 AI）
//
// 跨边界依赖（通过 args 注入）：
//   - inflightRef: 共享的请求控制器（与 useGeneration 共用，谁先动就 abort 对方）
//   - getCurrentResult: 函数形式，避免闭包陈旧
//   - appendMessage / setMuseState / spawnStars: Fairy 主壳的能力

import { useCallback, useRef, useState, type RefObject } from 'react';
import { generateStoryChapters, insertStoryChapter } from '../../../services/chapterService';
import type { CurrentResult, StoryChapter } from '../../../types';
import { CONFIG } from '../../../config';
import { T } from '../../../i18n/zh';
import { mid } from '../helpers';
import type { ChatMessage, MuseState } from '../types';

export function useChapters(args: {
  inflightRef: RefObject<AbortController | null>;
  getCurrentResult: () => CurrentResult | null;
  appendMessage: (m: ChatMessage) => void;
  setMuseState: (s: MuseState) => void;
  spawnStars: (n?: number) => void;
}) {
  const {
    inflightRef, getCurrentResult,
    appendMessage, setMuseState, spawnStars,
  } = args;

  const [chapters, setChapters] = useState<StoryChapter[]>([]);
  const [chapterBusy, setChapterBusy] = useState(false);
  // 章节降级状态：最新一次生成 / 插入是否走了 mock。给"最新章节卡"的顶部 hint 用。
  const [chaptersDegraded, setChaptersDegraded] = useState(false);

  // 镜像 ref：useGeneration 的 refineSmart 分支需要实时读 chapters
  const chaptersRef = useRef<StoryChapter[]>([]);
  chaptersRef.current = chapters;

  // ── 生成 N 章（"3" / "三章" 等输入触发）─────────────────────────
  const generateChapters = useCallback(async (count: number) => {
    const cur = getCurrentResult();
    if (!cur || cur.resultType !== 'story' || !cur.story) {
      appendMessage({
        id: mid(), role: 'muse', resultType: 'hint',
        content: T.errors.onlyOnStoryPath,
        createdAt: new Date().toISOString(),
      });
      setMuseState('idle');
      return;
    }

    // abort 任何在飞的请求（refine / 其它章节请求）
    inflightRef.current?.abort();
    const ctrl = new AbortController();
    inflightRef.current = ctrl;

    setChapterBusy(true);
    setMuseState('thinking');
    try {
      const res = await generateStoryChapters(
        { story: cur.story.content, chapterCount: count },
        ctrl.signal,
      );
      const now = new Date().toISOString();
      setChapters(res.chapters);
      // 用最新一次生成的"是否降级"覆盖整段章节状态——后续删除/插入若再次拿到 AI 输出，
      // 会在那一次的章节消息里更新。
      setChaptersDegraded(!!res.degraded);
      appendMessage({
        id: mid(), role: 'muse', resultType: 'chapters',
        chapters: res.chapters, content: '',
        chaptersDegraded: !!res.degraded,
        createdAt: now,
      });
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return;
      console.warn('[muse] generate chapters failed', err);
      appendMessage({
        id: mid(), role: 'muse', resultType: 'hint',
        content: T.errors.chapterGenFailed,
        createdAt: new Date().toISOString(),
      });
    } finally {
      setChapterBusy(false);
      setMuseState('idle');
      spawnStars(5);
    }
  }, [inflightRef, getCurrentResult, appendMessage, setMuseState, spawnStars]);

  // ── 单章删除（纯前端操作）─────────────────────────────────────
  const handleDeleteChapter = useCallback((index: number) => {
    setChapters(prev => prev
      .filter(c => c.index !== index)
      .map((c, i) => ({ ...c, index: i + 1 })),
    );
  }, []);

  // ── 单章插入（调后端 AI）────────────────────────────────────────
  const handleInsertChapterAfter = useCallback(async (afterIndex: number) => {
    if (chapterBusy) return;
    const cur = getCurrentResult();
    if (!cur || cur.resultType !== 'story' || !cur.story) return;
    if (chapters.length >= CONFIG.chapters.max) {
      appendMessage({
        id: mid(), role: 'muse', resultType: 'hint',
        content: T.errors.chapterMaxReached,
        createdAt: new Date().toISOString(),
      });
      return;
    }
    inflightRef.current?.abort();
    const ctrl = new AbortController();
    inflightRef.current = ctrl;
    setChapterBusy(true);
    setMuseState('thinking');
    try {
      const res = await insertStoryChapter(
        {
          story: cur.story.content,
          chapters,
          insertAfterIndex: afterIndex,
        },
        ctrl.signal,
      );
      const inserted = res.chapter;
      // 插入到 afterIndex 之后并重排序号
      const next: StoryChapter[] = [];
      let pushed = false;
      for (let i = 0; i < chapters.length; i++) {
        next.push(chapters[i]);
        if (chapters[i].index === afterIndex && !pushed) {
          next.push(inserted);
          pushed = true;
        }
      }
      if (!pushed) {
        // afterIndex === 0 → 顶端插入，或 afterIndex 等于末章 index
        if (afterIndex === 0) next.unshift(inserted);
        else next.push(inserted);
      }
      const renumbered = next.map((c, i) => ({ ...c, index: i + 1 }));
      setChapters(renumbered);
      // 任何一次插入降级都会让整段章节状态显示为降级。
      // 若 AI 恢复，下次成功的插入或重新生成会清除 flag。
      const degraded = !!res.degraded;
      if (degraded) setChaptersDegraded(true);
      appendMessage({
        id: mid(), role: 'muse', resultType: 'chapters',
        chapters: renumbered, content: '',
        chaptersDegraded: chaptersDegraded || degraded,
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return;
      console.warn('[muse] insert chapter failed', err);
      appendMessage({
        id: mid(), role: 'muse', resultType: 'hint',
        content: T.errors.chapterInsertFailed,
        createdAt: new Date().toISOString(),
      });
    } finally {
      setChapterBusy(false);
      setMuseState('idle');
    }
  }, [chapters, chapterBusy, inflightRef, getCurrentResult, appendMessage, setMuseState]);

  // ── 跨场景重置 ─────────────────────────────────────────────────
  // 切路径 / 重新生成时调用
  const resetChapters = useCallback(() => {
    setChapters([]);
    setChaptersDegraded(false);
  }, []);

  return {
    chapters, chapterBusy, chaptersDegraded,
    chaptersRef,            // 给 useGeneration 用
    setChapters,            // 给 useGeneration 的 refineSmart 分支用
    generateChapters,
    handleDeleteChapter, handleInsertChapterAfter,
    resetChapters,
  };
}
