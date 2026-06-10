// useTagCloud — 词云生命周期、选词、刷新、滑动窗口的 hook。
//
// 范围（C3 阶段抽出）：
//   - state: selectedTags / batch / excludeTexts / escape / analysis
//   - 派生: pathSelCount / stage / pathSelCountForPath
//   - 镜像 ref: latestBatchRef / latestExcludeRef / latestTagStateKeyRef
//                给 useAiCachePrefetch 的 effect 用，避免闭包陈旧
//   - callbacks: toggleTag / removeSelected / refreshBatch
//   - 切路径 / 生成完成的清理：resetCloudForPath / resetCloudAfterGenerate
//
// 不在范围内（属于其他 hook）：
//   - aiTagCache 池：属于 useAiCachePrefetch（C4）
//   - sendMessage / generate / chapter ops：属于 useGeneration / useChapters（C5）
//   - museState / setInput：留在 Fairy.tsx 主壳
//
// 关键设计：refreshBatch 不知道蓄水池存在。
//   外部（Fairy.tsx 主壳）从蓄水池取 N 张词作为 aiInjection 注入：
//     const aiTake = aiCache.consume(6);
//     refreshBatch({ aiInjection: aiTake });
//   这样 C4 时只需把 Fairy 主壳的 consume 调用搬到 useAiCachePrefetch，
//   不影响 useTagCloud。

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type Tag, type CreationPath, type FunnelStage,
  calcStage, drawBatch,
} from '../../../data/localTags';
import { makeStateKey } from '../../../services/tagService';
import type { DynamicTagAnalysis } from '../../../types';
import { CONFIG } from '../../../config';
import {
  drawFilledBatch, mockAnalysis, shuffleTags,
} from '../helpers';

interface RefreshOptions {
  escMode?: boolean;
  /**
   * 可选：从外部蓄水池预取的 AI 词卡，会优先放进新批次。
   * 调用方负责"从蓄水池里把这些词移除"。
   */
  aiInjection?: Tag[];
  /**
   * 配合 aiInjection 使用：消费蓄水池后，外部可能要清 prefetch 节流 key 让 effect 重新拉。
   * 给主壳一个回调钩子。
   */
  onConsumedAiCache?: () => void;
}

export function useTagCloud(args: {
  open: boolean;
  currentPath: CreationPath;
}) {
  const { open, currentPath } = args;

  // ─── state ───────────────────────────────────────────────────────
  const [selectedTags, setSelected]     = useState<Tag[]>([]);
  const [batch, setBatch]               = useState<Tag[]>([]);
  const [excludeTexts, setExcludeTexts] = useState<string[]>([]);
  const [escape, setEscape]             = useState(false);
  const [analysis, setAnalysis]         = useState<DynamicTagAnalysis | null>(null);

  // ─── 派生 ───────────────────────────────────────────────────────
  const pathSelCount = selectedTags.filter(t => t.path === currentPath).length;
  const stage: FunnelStage = calcStage(pathSelCount);

  // ─── 镜像 ref：每次 render 同步赋值 ────────────────────────────
  // useAiCachePrefetch 的 effect 需要从 ref 读最新值（避免闭包陈旧）。
  // 这些 ref 在 hook 内维护，由外部读取。
  const latestBatchRef        = useRef<Tag[]>([]);
  const latestExcludeRef      = useRef<string[]>([]);
  const latestTagStateKeyRef  = useRef('');
  // ⚠️ 必须在 render 顶层同步，不能放进 useEffect
  latestBatchRef.current       = batch;
  latestExcludeRef.current     = excludeTexts;
  latestTagStateKeyRef.current = makeStateKey(currentPath, stage, selectedTags, false);

  // ─── 初始 batch ─────────────────────────────────────────────────
  useEffect(() => {
    if (open && batch.length === 0) {
      const initial = drawBatch('story', [], 'spread', false, CONFIG.ui.cardsPerBatch);
      setBatch(initial);
      setAnalysis(mockAnalysis('story', [], 'spread'));
    }
  }, [open, batch.length]);

  // ─── toggle / remove ────────────────────────────────────────────
  // 注：选/删词时不清空 AI 蓄水池（早期版本有 invalidateAiCache 会让池子归零，
  // 用户连选 3 词后池子要重新攒 5s，体感是"点了好几次都看不到绿卡"）。
  // 蓄水池里的冲突由外部处理（消费时从池子里剔除）。
  const toggleTag = useCallback((tag: Tag, opts?: { onSelectFromCache?: (text: string) => void }) => {
    const isSel = selectedTags.some(t => t.text === tag.text);
    if (isSel) {
      setSelected(prev => prev.filter(t => t.text !== tag.text));
      // 取消选中也算"想再考虑这个词"，从 excludeTexts 移除让它能重新出现
      setExcludeTexts(prev => prev.filter(t => t !== tag.text));
    } else {
      if (selectedTags.length >= CONFIG.generation.maxSelectedTags) return;
      // 保留 tag 自带的 path —— AI 跨界词 (isCrossover=true) 的 path 可能与
      // currentPath 不同，按原 path 进入 selectedTags 才能正确计入对应路径的阶段。
      setSelected(prev => [...prev, tag]);
      // 如果用户选中了池子里的某张 AI 词，外部需要从池子里把它移除避免下次刷新重复出现
      opts?.onSelectFromCache?.(tag.text);
    }
  }, [selectedTags]);

  const removeSelected = useCallback((text: string) => {
    setSelected(prev => prev.filter(t => t.text !== text));
    // 用户主动删一个词，意味着想再考虑它 —— 把它从 excludeTexts 里清掉，
    // 这样下次刷新它有机会重新出现在词云里。
    setExcludeTexts(prev => prev.filter(t => t !== text));
  }, []);

  // ─── 添加自定义词（input 提交分支） ────────────────────────────
  const addSelectedFromInput = useCallback((text: string) => {
    if (selectedTags.some(t => t.text === text)) return false;
    if (selectedTags.length >= CONFIG.generation.maxSelectedTags) return false;
    setSelected(prev => [...prev, {
      id: `u${Date.now()}`, text, path: currentPath, source: 'user',
    }]);
    return true;
  }, [selectedTags, currentPath]);

  // ─── refresh ────────────────────────────────────────────────────
  // 缓存池模式：刷新必须快速响应，不等待 AI。
  // 优先级：
  //   1. escape 模式（🌪 跳出去）→ 立刻走本地 drawBatch，不消费 AI 缓存
  //   2. 外部传入 aiInjection（已从蓄水池取出）→ 优先入新批次，其余本地补
  //   3. 没 aiInjection → 全本地
  const refreshBatch = useCallback((opts: RefreshOptions = {}) => {
    const { escMode = false, aiInjection, onConsumedAiCache } = opts;
    const newEscape = escMode || escape;
    const newStage  = calcStage(selectedTags.filter(t => t.path === currentPath).length);

    // 滑动窗口：把当前 batch + 已选词加进排除列表，但只保留最近 N 个，避免
    // 无限增长导致整个本地词库被排除。selectedTags 是必排除（不重复出现已选词），
    // 所以始终放最前面，不会被滑动窗口截断。
    const EXCL_WINDOW = CONFIG.excludeWindow;
    const selectedSet = new Set(selectedTags.map(t => t.text));
    const recentExcl = [...batch.map(t => t.text), ...excludeTexts]
      .filter(t => !selectedSet.has(t));
    // 去重并截到窗口大小
    const seen = new Set<string>();
    const dedupedRecent: string[] = [];
    for (const t of recentExcl) {
      if (!seen.has(t)) { seen.add(t); dedupedRecent.push(t); }
      if (dedupedRecent.length >= EXCL_WINDOW) break;
    }
    const allExcl = [...selectedTags.map(t => t.text), ...dedupedRecent];
    setExcludeTexts(allExcl);

    const cardsPerBatch = CONFIG.ui.cardsPerBatch;

    if (!newEscape && aiInjection && aiInjection.length > 0) {
      const aiTake = aiInjection;
      const aiTexts = new Set(aiTake.map(t => t.text));
      const filler = drawFilledBatch(
        currentPath,
        [...allExcl, ...aiTexts],
        [...selectedTags.map(t => t.text), ...aiTexts],
        newStage,
        false,
        Math.max(0, cardsPerBatch - aiTake.length),
      );
      setBatch(shuffleTags([...aiTake, ...filler]).slice(0, cardsPerBatch));
      setEscape(false);
      onConsumedAiCache?.();
      return;
    }

    const newBatch = drawFilledBatch(
      currentPath,
      allExcl,
      selectedTags.map(t => t.text),
      newStage,
      newEscape,
      cardsPerBatch,
    );
    setBatch(newBatch);
    setAnalysis(mockAnalysis(currentPath, selectedTags, newStage));
    setEscape(false);
  }, [escape, currentPath, selectedTags, excludeTexts, batch]);

  // ─── 切路径 ─────────────────────────────────────────────────────
  // Fairy 主壳的 switchPath 会先 setCurrentPath(newPath)，然后调这个清理词云。
  // 这里同步 batch / analysis 到新 path，并 reset escape。
  const resetCloudForPath = useCallback((newPath: CreationPath) => {
    const newStage = calcStage(selectedTags.filter(t => t.path === newPath).length);
    const excluded = [...excludeTexts, ...selectedTags.map(t => t.text)];
    const newBatch = drawBatch(newPath, excluded, newStage, false, CONFIG.ui.cardsPerBatch);
    setBatch(newBatch);
    setAnalysis(mockAnalysis(newPath, selectedTags, newStage));
    setEscape(false);
  }, [selectedTags, excludeTexts]);

  // ─── 生成完成后的清理 ─────────────────────────────────────────
  // 本轮选词已消费完毕：清空锁定栏，词卡回到 spread 阶段重新撒网。
  // excludeTexts 保留 —— 用户"换一批"积累的偏好沿用到下一轮。
  const resetCloudAfterGenerate = useCallback((path: CreationPath) => {
    setSelected([]);
    setEscape(false);
    const resetBatch = drawBatch(path, excludeTexts, 'spread', false, CONFIG.ui.cardsPerBatch);
    setBatch(resetBatch);
    setAnalysis(mockAnalysis(path, [], 'spread'));
  }, [excludeTexts]);

  return {
    // state（只读暴露）
    selectedTags, batch, excludeTexts, escape, analysis,
    // 派生
    stage, pathSelCount,
    // 镜像 ref（给 prefetch effect 用）
    latestBatchRef, latestExcludeRef, latestTagStateKeyRef,
    // setters（C4 之前 prefetch effect / generate 还要直接用）
    setSelected, setBatch, setExcludeTexts, setEscape, setAnalysis,
    // callbacks
    toggleTag, removeSelected, addSelectedFromInput, refreshBatch,
    resetCloudForPath, resetCloudAfterGenerate,
  };
}
