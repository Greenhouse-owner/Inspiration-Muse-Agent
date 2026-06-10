// Fairy 模块的纯工具函数与本地兜底数据。
// 从 Fairy.tsx 抽出（C1 阶段）—— 行为一字不改，只挪位置。
//
// 不放 hook、不放 component、不放业务流程。只有：
//   1. 纯工具：mid / tagFontSize / tagColors / shuffleTags / drawFilledBatch
//   2. 静态数据：PATH_GAPS / STAGE_GOALS（取自 i18n，本地缓存为常量）
//   3. AI 分析的本地兜底：mockAnalysis（generate 失败时给 UI 一个结构化结果）

import {
  type Tag, type CreationPath, type FunnelStage,
  drawBatch,
} from '../../data/localTags';
import type { DynamicTagAnalysis } from '../../types';
import { theme as C } from '../../theme';
import { T } from '../../i18n/zh';

// ─── 唯一 ID 生成 ────────────────────────────────────────────────────
let _mid = 0;
export function mid() { return `m${(++_mid).toString(36)}`; }

// ─── 词卡尺寸 ───────────────────────────────────────────────────────
export function tagFontSize(text: string) {
  const n = text.length;
  if (n <= 3) return { fs: 11, px: 8,  py: 4 };
  if (n <= 6) return { fs: 12, px: 10, py: 5 };
  return              { fs: 12, px: 11, py: 5 };
}

// ─── 词卡配色（AI 词 vs 本地词，选中 vs 未选中）─────────────────────
export function tagColors(tag: Tag, selected: boolean) {
  const isAi = tag.source === 'ai';
  if (selected) {
    return isAi
      ? { border: '#4CAF50', background: '#4CAF50', color: '#fff', fontWeight: 600 }
      : { border: C.primary, background: C.primary, color: '#fff', fontWeight: 600 };
  }
  return isAi
    ? {
        border: 'rgba(76,175,80,.45)',
        background: 'rgba(76,175,80,.14)',
        color: '#C8E6C9',
        fontWeight: 500,
      }
    : { border: C.chipBd, background: C.chipBg, color: C.chipTxt, fontWeight: 400 };
}

// ─── 数组洗牌 ───────────────────────────────────────────────────────
export function shuffleTags(tags: Tag[]) {
  return [...tags].sort(() => Math.random() - 0.5);
}

// ─── 词云抓批兜底链 ──────────────────────────────────────────────────
// strict 不够 → 放宽 exclude → 还不够 → 完全不排除（保证 UI 永远有词显示）
export function drawFilledBatch(
  path: CreationPath,
  strictExcludeTexts: string[],
  relaxedExcludeTexts: string[],
  stage: FunnelStage,
  escape: boolean,
  count = 18,
) {
  const strict = drawBatch(path, strictExcludeTexts, stage, escape, count);
  if (strict.length >= count) return strict;

  const seen = new Set(strict.map(t => t.text));
  const relaxed = drawBatch(path, relaxedExcludeTexts, stage, escape, count)
    .filter(t => !seen.has(t.text));
  const merged = [...strict, ...relaxed];
  if (merged.length >= count) return merged.slice(0, count);

  const finalSeen = new Set(merged.map(t => t.text));
  const refill = drawBatch(path, [], stage, escape, count)
    .filter(t => !finalSeen.has(t.text));
  return [...merged, ...refill].slice(0, count);
}

// ─── 路径缺口名 / 阶段目标（本地常量，取自 i18n） ─────────────────────
export const PATH_GAPS: Record<CreationPath, readonly string[]> = T.tags.gaps;
export const STAGE_GOALS: Record<CreationPath, Record<FunnelStage, string>> = T.tags.stageGoals;

// ─── 本地兜底分析 ───────────────────────────────────────────────────
// 用于 dynamic-cloud 还没回来 / 失败时，给 UI 一个结构化的 analysis
export function mockAnalysis(
  path: CreationPath,
  selected: Tag[],
  stage: FunnelStage,
): DynamicTagAnalysis {
  const pathSelected = selected.filter(t => t.path === path);
  const allTexts = selected.map(t => t.text);
  const seeds: Record<CreationPath, () => string> = {
    story:     () => T.tags.seedStory(allTexts),
    character: () => T.tags.seedCharacter(allTexts),
    worldview: () => T.tags.seedWorldview(allTexts),
  };
  const gaps = PATH_GAPS[path].filter(g => !allTexts.some(t => t.includes(g.slice(0, 2))));
  const missing = gaps.sort(() => Math.random() - 0.5).slice(0, Math.max(2, 4 - pathSelected.length));
  const tone = allTexts.find(t => (T.tags.moodWords as readonly string[]).includes(t)) || T.tags.toneUndefined;

  return {
    storySeed: seeds[path](),
    currentGoal: STAGE_GOALS[path][stage],
    missing,
    tone,
    reason: missing.length ? T.tags.reasonGap(missing) : T.tags.reasonReady,
  };
}
