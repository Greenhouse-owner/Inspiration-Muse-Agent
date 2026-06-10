// useAiCachePrefetch — AI 词卡蓄水池 + 后台预取。
//
// 这是 P1 阶段最危险的 hook。包含：
//   - 1 个 state: aiTagCache
//   - 1 个 state: isPrefetching（用于 render 反馈）
//   - 3 个镜像 ref（aiTagCacheRef / isPrefetchingRef / lastPrefetchKeyRef）
//     —— 必须在 render 顶层同步赋值，不能放进 useEffect
//   - 1 个 abort ref（prefetchAbortRef）
//   - 1 个 useEffect（250ms 防抖 + dynamic-cloud 调用）
//
// 7 条不变量（修改时千万小心）：
//   1. aiTagCacheRef.current === aiTagCache（同步在 render 顶层）
//   2. isPrefetchingRef.current === isPrefetching（同步在 render 顶层）
//   3. lastPrefetchKeyRef 只在 setTimeout 起跑成功后赋值（避免节流误判）
//   4. effect 节流：key 没变 + 池满 → 不发请求
//   5. 读 latest{Batch,Exclude,TagStateKey}Ref 实时（不闭包陈旧）
//   6. analysis 通过 onAnalysis 回调外发（不在 hook 内 set）
//   7. prefetchAbortRef 独立于业务 inflightRef
//
// 暴露给外部：
//   - aiTagCache: 当前池子（refreshBatch 用 length 判断是否消费）
//   - consumeFromCache(n): 取 N 张返回，剩余 set 回池子，清 lastPrefetchKeyRef
//                          让 effect 重新拉
//   - removeFromCache(text): 用户选中池子里某张词时调
//   - invalidateCache(): 切路径 / 生成后调，清池子 + 清节流 + abort 飞行请求

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import {
  type Tag, type CreationPath, type FunnelStage,
} from '../../../data/localTags';
import { fetchDynamicCloud, makeStateKey } from '../../../services/tagService';
import type { DynamicTagAnalysis } from '../../../types';
import { CONFIG } from '../../../config';

const AI_CACHE_TARGET = CONFIG.aiCache.targetSize;

export function useAiCachePrefetch(args: {
  open: boolean;
  currentPath: CreationPath;
  stage: FunnelStage;
  selectedTags: Tag[];
  latestBatchRef: RefObject<Tag[]>;
  latestExcludeRef: RefObject<string[]>;
  latestTagStateKeyRef: RefObject<string>;
  onAnalysis: (a: DynamicTagAnalysis) => void;
}) {
  const {
    open, currentPath, stage, selectedTags,
    latestBatchRef, latestExcludeRef, latestTagStateKeyRef,
    onAnalysis,
  } = args;

  // ─── state ───────────────────────────────────────────────────────
  const [aiTagCache, setAiTagCache] = useState<Tag[]>([]);
  const [isPrefetching, setIsPrefetching] = useState(false);

  // ─── refs ───────────────────────────────────────────────────────
  const aiTagCacheRef        = useRef<Tag[]>([]);
  const isPrefetchingRef     = useRef(false);
  const lastPrefetchKeyRef   = useRef<string>('');
  const prefetchAbortRef     = useRef<AbortController | null>(null);

  // ⚠️ 不变量 1, 2：每次 render 顶层同步 ref
  // 这是为了 effect 内部读到最新值（避免闭包陈旧）。
  // 不能放进 useEffect，否则 effect 内读的还是上一帧的值。
  aiTagCacheRef.current = aiTagCache;
  isPrefetchingRef.current = isPrefetching;

  // ─── 后台预取 effect ────────────────────────────────────────────
  // 当 selectedTags / path / stage 变化后，一次拉一批补池（dynamic-cloud）。
  // 改成单次拉 batch，蓄水池立刻可用；只在缓存不足且无 inflight 时触发。
  // onAnalysis 回调用 ref 包一层避免 effect 因为函数引用变化反复重建。
  const onAnalysisRef = useRef(onAnalysis);
  onAnalysisRef.current = onAnalysis;

  useEffect(() => {
    if (!open) return;

    const key = makeStateKey(currentPath, stage, selectedTags, false);
    // 不变量 4: 节流
    if (key === lastPrefetchKeyRef.current && aiTagCacheRef.current.length >= AI_CACHE_TARGET) return;

    const requestPath = currentPath;
    const requestStage = stage;
    const requestSelectedTags = selectedTags;

    const timer = setTimeout(async () => {
      if (isPrefetchingRef.current) return;
      const need = AI_CACHE_TARGET - aiTagCacheRef.current.length;
      if (need <= 0) return;
      // 不变量 3: setTimeout 真正起跑后才标记 key
      lastPrefetchKeyRef.current = key;
      const ctrl = new AbortController();
      prefetchAbortRef.current = ctrl;
      setIsPrefetching(true);
      try {
        const cachedTexts = aiTagCacheRef.current.map(t => t.text);
        const res = await fetchDynamicCloud(requestPath, requestStage, requestSelectedTags, {
          excludeTexts: [
            ...(latestExcludeRef.current ?? []),
            ...((latestBatchRef.current ?? []).map(t => t.text)),
            ...requestSelectedTags.map(t => t.text),
            ...cachedTexts,
          ],
          count: Math.min(need + CONFIG.aiCache.fetchOverhead, CONFIG.aiCache.maxFetchPerCall),
          escape: false,
          signal: ctrl.signal,
        });
        if (ctrl.signal.aborted) return;
        // 不变量 5: stateKey 已变（用户已切到别的上下文），丢弃响应
        if (res.path !== requestPath || key !== latestTagStateKeyRef.current) return;
        if (res.tags && res.tags.length > 0) {
          setAiTagCache(prev => {
            const have = new Set(prev.map(t => t.text));
            const fresh = res.tags.filter(t => !have.has(t.text));
            return [...prev, ...fresh].slice(0, AI_CACHE_TARGET);
          });
        }
        // 不变量 6: analysis 外发
        if (res.analysis) onAnalysisRef.current(res.analysis);
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return;
        console.warn('[muse] prefetch dynamic-cloud failed', err);
      } finally {
        if (prefetchAbortRef.current === ctrl) {
          setIsPrefetching(false);
        }
      }
    }, CONFIG.aiCache.refreshDebounceMs);

    return () => clearTimeout(timer);
  }, [
    open, currentPath, stage, selectedTags,
    aiTagCache.length, isPrefetching,
    latestBatchRef, latestExcludeRef, latestTagStateKeyRef,
  ]);

  // ─── 公共 API ────────────────────────────────────────────────────

  // 消费蓄水池：取前 N 张，剩余 set 回池子，并清 lastPrefetchKeyRef 让 effect 重新拉
  const consumeFromCache = useCallback((n: number): Tag[] => {
    if (aiTagCache.length === 0 || n <= 0) return [];
    const take = aiTagCache.slice(0, n);
    const rest = aiTagCache.slice(take.length);
    setAiTagCache(rest);
    lastPrefetchKeyRef.current = '';
    return take;
  }, [aiTagCache]);

  // 用户选中池子里某张 AI 词时，从池子里把它移除
  const removeFromCache = useCallback((text: string) => {
    setAiTagCache(prev => prev.filter(t => t.text !== text));
  }, []);

  // 切路径 / 生成后调：清池子 + 清节流 + abort 飞行请求
  const invalidateCache = useCallback(() => {
    setAiTagCache([]);
    lastPrefetchKeyRef.current = '';
    prefetchAbortRef.current?.abort();
  }, []);

  return {
    aiTagCache,
    consumeFromCache,
    removeFromCache,
    invalidateCache,
  };
}
