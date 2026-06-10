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

// ─── 三路径生成结果 ───────────────────────────────────────────────────────────

export interface StoryResult {
  content: string;
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
}

export interface WorldviewResult {
  title: string;
  coreRule: string;
  cost: string;
  taboo: string;
  socialImpact: string;
  conflictHooks: string[];
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
}

export interface InsertStoryChapterRequest {
  story: string;
  chapters: StoryChapter[];
  insertAfterIndex: number;
  hint?: string;
}

export interface InsertStoryChapterResponse {
  chapter: StoryChapter;
}

// ─── Smart refine（故事 + 章节）────────────────────────────────────────────

export type SmartTarget = 'story' | 'chapters';

export interface RefineSmartRequest {
  selectedTags: Tag[];
  instruction: string;
  story: StoryResult;
  chapters?: StoryChapter[];
}

export interface RefineSmartResponse {
  targets: SmartTarget[];
  story?: StoryResult | null;
  chapters?: StoryChapter[] | null;
  note?: string | null;
}
