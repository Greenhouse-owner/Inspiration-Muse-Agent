// useRecipe —— 调味词卡 v1 的状态机。
//
// 范围（这个 hook 只管 UI 状态，不发请求）：
//   - 从 currentResult 中读出当前 recipe / swaps（read-only mirror）
//   - pendingTags / pendingText：用户在输入框里"准备发送"的内容
//   - lastPickedCard：用户最近点击的那张调味词卡（用于驱动 StageHint 副标题预览）
//   - togglePendingTag：同槽覆盖 / 不同槽并存 / 已选则取消（toggle）
//   - clearPending：currentResult 切换或发送完成后清空
//
// 不在范围：
//   - 调用 refine-smart 接口 → useGeneration
//   - 调用 refresh-swaps 接口 → useGeneration / Fairy 顶层

import { useEffect, useMemo, useState } from 'react';
import type { CurrentResult, Recipe, SwapBatch } from '../../../types';
import type { ChipTag } from '../components/ChipAwareInput';

export interface PickedCard {
  field: string;
  label: string;
  preview: string;
}

// 兼容旧名字 —— SwapCloud 等组件已用 HoveredCard 类型签名
// 实际用途变成了 "lastPickedCard"，但类型形状一样，就 alias 复用。
export type HoveredCard = PickedCard;

export function useRecipe(args: {
  currentResult: CurrentResult | null;
}) {
  const { currentResult } = args;

  // 从 currentResult 中读出 recipe / swaps（不同 path 字段不同位置）
  const { recipe, swaps } = useMemo<{
    recipe: Recipe | undefined;
    swaps: SwapBatch | undefined;
  }>(() => {
    if (!currentResult) return { recipe: undefined, swaps: undefined };
    if (currentResult.resultType === 'story') {
      return { recipe: currentResult.story?.recipe, swaps: currentResult.story?.swaps };
    }
    if (currentResult.resultType === 'character') {
      return { recipe: currentResult.character?.recipe, swaps: currentResult.character?.swaps };
    }
    if (currentResult.resultType === 'worldview') {
      return { recipe: currentResult.worldview?.recipe, swaps: currentResult.worldview?.swaps };
    }
    return { recipe: undefined, swaps: undefined };
  }, [currentResult]);

  const [pendingTags, setPendingTags] = useState<ChipTag[]>([]);
  const [pendingText, setPendingText] = useState('');
  // 最近点击的那张词卡（用于 StageHint 副标题）
  const [lastPickedCard, setLastPickedCard] = useState<PickedCard | null>(null);

  // 用 outline 文本作为"结果换了新一轮"的判定 key —— 仅当核心文本真变化才清 pending。
  // refresh-swaps 局部更新 swaps 时 currentResult 引用变了但 outline 不变，
  // 此时不该清 pendingTags（用户已选的粉色 tag 应该保留）。
  const outlineKey = useMemo(() => {
    if (!currentResult) return '';
    if (currentResult.resultType === 'story') return currentResult.story?.content ?? '';
    if (currentResult.resultType === 'character') {
      const c = currentResult.character;
      return c ? `${c.name}|${c.identity}|${c.wound}|${c.desire}` : '';
    }
    if (currentResult.resultType === 'worldview') {
      const w = currentResult.worldview;
      return w ? `${w.title}|${w.coreRule}|${w.taboo}` : '';
    }
    return '';
  }, [currentResult]);

  // outline 变了（生成 / refine 完成 / 重选）→ 自动清 pending
  useEffect(() => {
    setPendingTags([]);
    setPendingText('');
    setLastPickedCard(null);
  }, [outlineKey]);

  // toggle 语义：同槽覆盖 / 不同槽追加 / 同槽同 label 取消
  // 同时维护 lastPickedCard
  const togglePendingTag = (field: string, label: string, preview?: string) => {
    setPendingTags(prev => {
      const same = prev.find(t => t.field === field);
      if (same) {
        if (same.label === label) {
          // 已选这张 → 取消
          setLastPickedCard(null);
          return prev.filter(t => t.field !== field);
        }
        // 同槽不同 label → 覆盖
        if (preview !== undefined) setLastPickedCard({ field, label, preview });
        return prev.map(t => (t.field === field ? { field, label } : t));
      }
      // 不同槽 → 追加
      if (preview !== undefined) setLastPickedCard({ field, label, preview });
      return [...prev, { field, label }];
    });
  };

  const clearPending = () => {
    setPendingTags([]);
    setPendingText('');
    setLastPickedCard(null);
  };

  // 给 ChipAwareInput backspace 删 tag 后做收尾：如果删掉的是 lastPickedCard 那张，清空预览
  const syncLastPickedAfterTagsChange = (nextTags: ChipTag[]) => {
    if (!lastPickedCard) return;
    const stillThere = nextTags.some(
      t => t.field === lastPickedCard.field && t.label === lastPickedCard.label,
    );
    if (!stillThere) setLastPickedCard(null);
  };

  return {
    recipe,
    swaps,
    pendingTags,
    pendingText,
    setPendingTags,
    setPendingText,
    lastPickedCard,
    setLastPickedCard,
    togglePendingTag,
    clearPending,
    syncLastPickedAfterTagsChange,
  };
}
