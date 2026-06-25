// 前端共用类型 — Fairy.tsx 与 services 都从这里 import
// 与后端 (backend/app/schemas/*) wire format 严格对齐

import type { Tag, CreationPath, FunnelStage } from '../data/localTags';

export type { Tag, CreationPath, FunnelStage };

// ─── 动态词卡分析 ─────────────────────────────────────────────────────────────
export interface DynamicTagAnalysis {
  storySeed: string;
  currentGoal: string;
  missing: string[];
  tone: string;
  reason?: string;
}

// ─── 调味词卡（Recipe / Swap） ────────────────────────────────────────────────
// 与后端 schemas/result.py、schemas/chat.py 严格对齐。
// 所有字段在结果类型上是可选的：旧后端 / mock 降级路径不返回 recipe/swaps 时，
// UI 完全维持现状（调味区不渲染）。

export interface SwapCard {
  label: string;
  preview: string;
}

export interface RecipeSlot {
  field: string;   // 后端字段名，例如 "character" / "wound" / "coreRule"
  value: string;   // 当前简短代号（用于配方栏显示）
}

export interface Recipe {
  slots: RecipeSlot[];   // 恰好 3 个
}

export interface SwapBatch {
  // key 与 Recipe.slots[i].field 一一对应；每槽 3 张
  cards: Record<string, SwapCard[]>;
}

export interface SwapInstruction {
  field: string;
  label: string;
}

// ─── 三路径生成结果 ───────────────────────────────────────────────────────────

export interface StoryResult {
  content: string;
  recipe?: Recipe;
  swaps?: SwapBatch;
}

export interface CharacterResult {
  name: string;
  identity: string;
  personality: string;
  wound: string;
  desire: string;
  fear: string;
  secret: string;
  arc: string;
  recipe?: Recipe;
  swaps?: SwapBatch;
}

export interface WorldviewResult {
  title: string;
  coreRule: string;
  cost: string;
  taboo: string;
  socialImpact: string;
  conflictHooks: string[];
  recipe?: Recipe;
  swaps?: SwapBatch;
}

export type ResultType = 'story' | 'character' | 'worldview';

// 当前已生成的结果，refine / expand 时回传给后端
export interface CurrentResult {
  resultType: ResultType;
  story?: StoryResult;
  character?: CharacterResult;
  worldview?: WorldviewResult;
}

// ─── API 请求/响应 schemas ────────────────────────────────────────────────────

export interface DynamicCloudRequest {
  stateKey: string;
  path: CreationPath;
  stage: FunnelStage;
  selectedTags: Tag[];
  excludeTexts?: string[];
  count?: number;
  escape?: boolean;
  mode?: 'prefetch' | 'immediate';
}

export interface DynamicCloudResponse {
  stateKey: string;
  path: CreationPath;
  stage: FunnelStage;
  analysis: DynamicTagAnalysis;
  tags: Tag[];
  degraded?: boolean;
  degradeReason?: string;
}

export interface GenerateRequest {
  selectedTags: Tag[];
}

export interface GenerateStoryResponse {
  path: 'story';
  result: StoryResult;
}

export interface GenerateCharacterResponse {
  path: 'character';
  result: CharacterResult;
}

export interface GenerateWorldviewResponse {
  path: 'worldview';
  result: WorldviewResult;
}

export interface RefineRequest {
  path: CreationPath;
  selectedTags: Tag[];
  currentResult: CurrentResult;
  userRequest: string;
}

export interface RefineResponse {
  result: CurrentResult;
}

// ─── 章节相关 ────────────────────────────────────────────────────────────────

export interface StoryChapter {
  index: number;
  title: string;
  summary: string;
  body?: string | null;
  conflictPoint?: string | null;
}

export interface StoryChaptersRequest {
  story: string;
  chapterCount: number;
  styleHint?: string;
}

export interface StoryChaptersResponse {
  chapters: StoryChapter[];
  degraded?: boolean;
  degradeReason?: string;
}

export interface InsertStoryChapterRequest {
  story: string;
  chapters: StoryChapter[];
  insertAfterIndex: number;
  hint?: string;
}

export interface InsertStoryChapterResponse {
  chapter: StoryChapter;
  degraded?: boolean;
  degradeReason?: string;
}

// ─── Smart refine（故事 + 章节 + 调味词卡）────────────────────────────────

export type SmartTarget = 'story' | 'chapters';

export interface RefineSmartRequest {
  selectedTags: Tag[];
  instruction: string;
  story: StoryResult;
  chapters?: StoryChapter[];
  // 新增（v1.2 调味词卡）。全部可选，旧调用方不传时与原行为一致。
  path?: CreationPath;
  currentRecipe?: Recipe;
  swapInstructions?: SwapInstruction[];
  excludeSwapTexts?: string[];
}

export interface RefineSmartResponse {
  targets: SmartTarget[];
  story?: StoryResult | null;
  chapters?: StoryChapter[] | null;
  note?: string | null;
  // 新增：新一轮的 recipe / swaps
  recipe?: Recipe | null;
  swaps?: SwapBatch | null;
}

export interface RefreshSwapsRequest {
  path: CreationPath;
  outline: string;
  recipe: Recipe;
  excludeSwapTexts?: string[];
}

export interface RefreshSwapsResponse {
  swaps?: SwapBatch | null;
  degraded?: boolean;
  degradeReason?: string;
}
