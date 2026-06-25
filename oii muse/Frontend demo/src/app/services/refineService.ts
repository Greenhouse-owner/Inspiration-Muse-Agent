// Refine 服务 — 用户在已有结果上继续输入自然语言修改需求时调用。

import { apiPost } from './apiClient';
import type {
  CreationPath,
  Tag,
  CurrentResult,
  Recipe,
  RefineRequest,
  RefineResponse,
  RefineSmartRequest,
  RefineSmartResponse,
  RefreshSwapsRequest,
  RefreshSwapsResponse,
  StoryResult,
  StoryChapter,
  SwapInstruction,
} from '../types';

export async function refineResult(
  path: CreationPath,
  selectedTags: Tag[],
  currentResult: CurrentResult,
  userRequest: string,
  signal?: AbortSignal,
): Promise<RefineResponse> {
  return apiPost<RefineRequest, RefineResponse>(
    '/result/refine',
    { path, selectedTags, currentResult, userRequest },
    { signal },
  );
}

export async function refineSmart(
  selectedTags: Tag[],
  instruction: string,
  story: StoryResult,
  chapters: StoryChapter[] | undefined,
  signal?: AbortSignal,
  // v1.2 新增：调味相关。旧调用方不传时与原行为一致。
  swapArgs?: {
    path?: CreationPath;
    currentRecipe?: Recipe;
    swapInstructions?: SwapInstruction[];
    excludeSwapTexts?: string[];
  },
): Promise<RefineSmartResponse> {
  return apiPost<RefineSmartRequest, RefineSmartResponse>(
    '/result/refine-smart',
    {
      selectedTags,
      instruction,
      story,
      chapters: chapters && chapters.length > 0 ? chapters : undefined,
      ...(swapArgs?.path ? { path: swapArgs.path } : {}),
      ...(swapArgs?.currentRecipe ? { currentRecipe: swapArgs.currentRecipe } : {}),
      ...(swapArgs?.swapInstructions ? { swapInstructions: swapArgs.swapInstructions } : {}),
      ...(swapArgs?.excludeSwapTexts ? { excludeSwapTexts: swapArgs.excludeSwapTexts } : {}),
    },
    { timeoutMs: 90_000, signal },
  );
}

export async function refreshSwaps(
  path: CreationPath,
  outline: string,
  recipe: Recipe,
  excludeSwapTexts: string[] | undefined,
  signal?: AbortSignal,
): Promise<RefreshSwapsResponse> {
  return apiPost<RefreshSwapsRequest, RefreshSwapsResponse>(
    '/result/refresh-swaps',
    {
      path,
      outline,
      recipe,
      ...(excludeSwapTexts && excludeSwapTexts.length > 0
        ? { excludeSwapTexts }
        : {}),
    },
    { timeoutMs: 20_000, signal },
  );
}

