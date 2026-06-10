// Refine 服务 — 用户在已有结果上继续输入自然语言修改需求时调用。

import { apiPost } from './apiClient';
import type {
  CreationPath,
  Tag,
  CurrentResult,
  RefineRequest,
  RefineResponse,
  RefineSmartRequest,
  RefineSmartResponse,
  StoryResult,
  StoryChapter,
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
): Promise<RefineSmartResponse> {
  return apiPost<RefineSmartRequest, RefineSmartResponse>(
    '/result/refine-smart',
    {
      selectedTags,
      instruction,
      story,
      chapters: chapters && chapters.length > 0 ? chapters : undefined,
    },
    { timeoutMs: 90_000, signal },
  );
}

