// useGeneration — 生成 + refine 链路。
//
// 范围：
//   - state: currentResult
//   - generate(): 选词后点"生成"，按 path 调对应 service，结果写进 messages + currentResult
//   - refine(text): 文本 refine 智能分发：
//       - story 路径 → refineSmart（AI 自己判断改 story / chapters / 都改）
//       - character / worldview → refineResult（老接口，按 patch 协议）
//
// 不在范围：
//   - 章节生成 / 删除 / 插入 → useChapters
//   - 意图解析（parseIntent）→ Fairy 主壳的 sendMessage 路由
//
// 跨边界依赖（args 注入）：
//   - inflightRef: 与 useChapters 共享的请求控制器
//   - getChapters: 函数形式获取最新章节（refineSmart 要传给后端 + 写回更新）
//   - setChapters: refineSmart 返回新章节时写回
//   - resetChapters: generate 完成时清空旧章节
//   - resetCloudAfterGenerate / invalidateAiCache: 生成后清理上下游
//   - appendMessage / appendMessages / setMuseState / spawnStars: Fairy 主壳能力

import { useCallback, useRef, useState, type RefObject } from 'react';
import {
  generateStory, generateCharacter, generateWorldview,
} from '../../../services/generateService';
import { refineResult, refineSmart, refreshSwaps } from '../../../services/refineService';
import type {
  Tag, CreationPath, CurrentResult, StoryChapter,
  Recipe, SwapBatch, SwapInstruction,
} from '../../../types';
import { CONFIG } from '../../../config';
import { T } from '../../../i18n/zh';
import { mid } from '../helpers';
import type { ChatMessage, MuseState } from '../types';

export function useGeneration(args: {
  inflightRef: RefObject<AbortController | null>;
  currentPath: CreationPath;
  getSelectedTags: () => Tag[];
  // 跨 hook 协作
  getChapters: () => StoryChapter[];
  setChapters: (c: StoryChapter[]) => void;
  resetChapters: () => void;
  // useTagCloud / useAiCachePrefetch 暴露
  resetCloudAfterGenerate: (path: CreationPath) => void;
  invalidateAiCache: () => void;
  // Fairy 主壳能力
  appendMessage: (m: ChatMessage) => void;
  appendMessages: (ms: ChatMessage[]) => void;
  setMuseState: (s: MuseState) => void;
  spawnStars: (n?: number) => void;
}) {
  const {
    inflightRef, currentPath,
    getSelectedTags, getChapters, setChapters, resetChapters,
    resetCloudAfterGenerate, invalidateAiCache,
    appendMessage, appendMessages, setMuseState, spawnStars,
  } = args;

  const [currentResult, setCurrentResult] = useState<CurrentResult | null>(null);

  // 镜像 ref：sendMessage 路由通过 getCurrentResult 实时读
  const currentResultRef = useRef<CurrentResult | null>(null);
  currentResultRef.current = currentResult;

  // ── Generate ───────────────────────────────────────────────────────────────
  const generate = useCallback(async () => {
    const tags = getSelectedTags();
    if (tags.length < CONFIG.generation.minTagsToGenerate) return;

    setMuseState('thinking');
    const userMsg: ChatMessage = {
      id: mid(), role: 'user',
      content: `已选词：${tags.map(t => t.text).join('、')}`,
      createdAt: new Date().toISOString(),
    };
    appendMessage(userMsg);

    const path = currentPath;
    const now = () => new Date().toISOString();

    try {
      let msg: ChatMessage;
      let nextResult: CurrentResult;

      if (path === 'story') {
        const r = await generateStory(tags);
        msg = {
          id: mid(), role: 'muse', content: r.content,
          resultType: 'story', createdAt: now(),
        };
        nextResult = { resultType: 'story', story: r };
      } else if (path === 'character') {
        const r = await generateCharacter(tags);
        msg = {
          id: mid(), role: 'muse', content: '', resultType: 'character',
          characterResult: r, createdAt: now(),
        };
        nextResult = { resultType: 'character', character: r };
      } else {
        const r = await generateWorldview(tags);
        msg = {
          id: mid(), role: 'muse', content: '', resultType: 'worldview',
          worldviewResult: r, createdAt: now(),
        };
        nextResult = { resultType: 'worldview', worldview: r };
      }

      appendMessage(msg);
      setCurrentResult(nextResult);
      // 故事/角色/世界观一旦显示出来，立刻把 UI 切回可输入状态。
      // success 状态只是个动画过渡，不影响输入；放在这里能避免后处理崩溃锁住输入框。
      setMuseState('success');
      spawnStars(8);
      setTimeout(() => setMuseState('idle'), CONFIG.ui.successAnimationMs);

      // 新生成 → 清掉旧章节；如果是 story 路径，追加一条提示让用户知道可以输数字拆章节
      resetChapters();
      if (path === 'story') {
        appendMessage({
          id: mid(), role: 'muse', resultType: 'hint',
          content: T.chapters.afterStoryHint,
          createdAt: now(),
        });
      }

      // 本轮选词已消费完毕：清空锁定栏，词卡回到 spread 阶段重新撒网。
      // excludeTexts 保留 —— 用户"换一批"积累的偏好沿用到下一轮。
      resetCloudAfterGenerate(path);
      // 失效 prefetch 节流 + 清池，让下一轮 selectedTags 变化能再次触发后台拉取
      invalidateAiCache();
    } catch (err) {
      console.warn('[muse] generate post-processing crashed', err);
      // 兜底：确保 thinking 一定退出
      setMuseState('idle');
    }
  }, [
    currentPath, getSelectedTags, resetChapters,
    resetCloudAfterGenerate, invalidateAiCache,
    appendMessage, setMuseState, spawnStars,
  ]);

  // ── Refine 智能分发 ─────────────────────────────────────────────────────
  // story 路径走 smart refine（AI 决定改故事 / 改章节 / 都改）
  // character / worldview 仍走旧 refineResult
  //
  // v1.2 起接 swap：story 路径可以额外传 swapInstructions / currentRecipe /
  // excludeSwapTexts，AI 一次返回新故事 + 新 recipe + 新 swaps。
  const refine = useCallback(async (
    text: string,
    swapArgs?: {
      currentRecipe?: Recipe;
      swapInstructions?: SwapInstruction[];
      excludeSwapTexts?: string[];
    },
  ) => {
    const cur = currentResultRef.current;
    if (!cur) return;

    setMuseState('thinking');

    // abort 旧请求
    inflightRef.current?.abort();
    const ctrl = new AbortController();
    inflightRef.current = ctrl;

    const onStoryPath = cur.resultType === 'story' && !!cur.story;

    if (onStoryPath && cur.story) {
      // ── Smart refine ────────────────────────────────────────────────
      try {
        const chapters = getChapters();
        const res = await refineSmart(
          getSelectedTags(),
          text,
          cur.story,
          chapters.length > 0 ? chapters : undefined,
          ctrl.signal,
          swapArgs ? {
            path: 'story',
            currentRecipe: swapArgs.currentRecipe,
            swapInstructions: swapArgs.swapInstructions,
            excludeSwapTexts: swapArgs.excludeSwapTexts,
          } : undefined,
        );
        const now = new Date().toISOString();
        const updates: ChatMessage[] = [];
        if (res.story) {
          // 后端可能在 story.recipe / story.swaps 里塞了新一轮的配方词卡；
          // 顶层 res.recipe / res.swaps 也可能有（service 层做了双写）。
          // 优先取 story 内的，缺则回退到顶层。
          // 关键：AI 在纯文字 refine 时 prompt 允许 recipe/swaps 返回 null（"前端会保留前一轮配方"）；
          // 此时必须从旧 currentResult 拿，否则调味区会消失。
          const oldStory = currentResultRef.current?.story;
          const mergedStory = {
            ...res.story,
            recipe: res.story.recipe ?? res.recipe ?? oldStory?.recipe,
            swaps: res.story.swaps ?? res.swaps ?? oldStory?.swaps,
          };
          setCurrentResult({ resultType: 'story', story: mergedStory });
          updates.push({
            id: mid(), role: 'muse', resultType: 'story',
            content: res.story.content, createdAt: now,
          });
        }
        if (res.chapters) {
          setChapters(res.chapters);
          updates.push({
            id: mid(), role: 'muse', resultType: 'chapters',
            chapters: res.chapters, content: '', createdAt: now,
          });
        }
        if (res.note && !swapArgs) {
          // 调味期（swapArgs 非空）的 note 不进流：用户已经从 StageHint 副标题
          // 看到了"换成 X，故事就会..."的预览，再回显一遍 note 太啰嗦。
          updates.push({
            id: mid(), role: 'muse', resultType: 'hint',
            content: res.note, createdAt: now,
          });
        }
        if (updates.length === 0) {
          updates.push({
            id: mid(), role: 'muse', resultType: 'hint',
            content: T.errors.refineNoChange,
            createdAt: now,
          });
        }
        appendMessages(updates);
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return;
        console.warn('[muse] refine smart failed', err);
        appendMessage({
          id: mid(), role: 'muse', resultType: 'hint',
          content: T.errors.refineFailedSmart,
          createdAt: new Date().toISOString(),
        });
      } finally {
        setMuseState('idle');
        spawnStars(5);
      }
      return;
    }

    // ── Legacy refine（character / worldview）────────────────────────
    try {
      const { result } = await refineResult(
        currentPath, getSelectedTags(), cur, text, ctrl.signal,
      );
      const now = new Date().toISOString();
      let newMsg: ChatMessage;
      if (result.resultType === 'story' && result.story) {
        newMsg = {
          id: mid(), role: 'muse', content: result.story.content,
          resultType: 'story', createdAt: now,
        };
      } else if (result.resultType === 'character' && result.character) {
        newMsg = {
          id: mid(), role: 'muse', content: '', resultType: 'character',
          characterResult: result.character, createdAt: now,
        };
      } else if (result.resultType === 'worldview' && result.worldview) {
        newMsg = {
          id: mid(), role: 'muse', content: '', resultType: 'worldview',
          worldviewResult: result.worldview, createdAt: now,
        };
      } else {
        throw new Error(`refine returned empty ${result.resultType} result`);
      }
      appendMessage(newMsg);
      setCurrentResult(result);
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return;
      console.warn('[muse] refine API failed', err);
      appendMessage({
        id: mid(), role: 'muse',
        content: T.errors.refineFailedLegacy,
        resultType: 'hint', createdAt: new Date().toISOString(),
      });
    } finally {
      setMuseState('idle');
      spawnStars(5);
    }
  }, [
    currentPath, inflightRef,
    getSelectedTags, getChapters, setChapters,
    appendMessage, appendMessages, setMuseState, spawnStars,
  ]);

  // ── Refresh swaps（仅刷新词卡，结果与配方不变。走 cheap 模型 1-2 秒）──
  const refreshSwapsAction = useCallback(async (
    excludeSwapTexts?: string[],
  ): Promise<SwapBatch | null> => {
    const cur = currentResultRef.current;
    if (!cur) return null;

    // 拿到当前 outline 文本 + recipe，根据 path 选字段
    let outline = '';
    let recipe: Recipe | undefined;
    if (cur.resultType === 'story' && cur.story) {
      outline = cur.story.content;
      recipe = cur.story.recipe;
    } else if (cur.resultType === 'character' && cur.character) {
      const c = cur.character;
      outline = [c.identity, c.personality, c.wound, c.desire].filter(Boolean).join('\n');
      recipe = c.recipe;
    } else if (cur.resultType === 'worldview' && cur.worldview) {
      const w = cur.worldview;
      outline = [w.coreRule, w.cost, w.taboo, w.socialImpact].filter(Boolean).join('\n');
      recipe = w.recipe;
    }
    if (!recipe || !outline) return null;

    // ⚠️ AbortController 必须挂到 inflightRef，让 handleRestart / 切路径 / 新请求都能 abort 它。
    // 之前是新建一个独立 controller 没挂 ref，导致重选/切路径后旧响应回来仍 setCurrentResult，
    // 把已清空的状态写回（refresh-swaps 抗中断 bug）。
    inflightRef.current?.abort();
    const ctrl = new AbortController();
    inflightRef.current = ctrl;
    try {
      const res = await refreshSwaps(currentPath, outline, recipe, excludeSwapTexts, ctrl.signal);
      // resolve 后再读一次 ref：如果用户中途清空了 currentResult（重选）或换了一轮（refine 完成），
      // 这一次 refresh 的结果已经过期，丢弃。
      if (currentResultRef.current !== cur) return null;
      if (!res.swaps) return null;

      // 局部更新 currentResult 中的 swaps，不动 content / recipe
      const next: CurrentResult = { ...cur };
      if (next.resultType === 'story' && next.story) {
        next.story = { ...next.story, swaps: res.swaps };
      } else if (next.resultType === 'character' && next.character) {
        next.character = { ...next.character, swaps: res.swaps };
      } else if (next.resultType === 'worldview' && next.worldview) {
        next.worldview = { ...next.worldview, swaps: res.swaps };
      }
      setCurrentResult(next);
      return res.swaps;
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return null;
      console.warn('[muse] refreshSwaps failed', err);
      return null;
    }
  }, [currentPath, inflightRef]);

  return {
    currentResult,
    setCurrentResult,
    currentResultRef,        // 给 Fairy 主壳的 sendMessage 路由用
    generate,
    refine,
    refreshSwapsAction,
  };
}
