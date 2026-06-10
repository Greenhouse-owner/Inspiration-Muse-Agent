// 生成服务 — 把 mock 调用替换为后端 API，失败时由调用方 fallback 到 mock。
//
// 三个函数都只做"调 API + 解包 result"，不做 fallback；fallback 在 Fairy.tsx
// 里围绕调用做，这样可以在失败时把降级的提示也展示给用户。

import { apiPost } from './apiClient';
import type {
  Tag,
  StoryResult,
  CharacterResult,
  WorldviewResult,
  GenerateRequest,
  GenerateStoryResponse,
  GenerateCharacterResponse,
  GenerateWorldviewResponse,
} from '../types';

export async function generateStory(
  selectedTags: Tag[],
  signal?: AbortSignal,
): Promise<StoryResult> {
  const res = await apiPost<GenerateRequest, GenerateStoryResponse>(
    '/generate/story',
    { selectedTags },
    { signal },
  );
  return res.result;
}

export async function generateCharacter(
  selectedTags: Tag[],
  signal?: AbortSignal,
): Promise<CharacterResult> {
  const res = await apiPost<GenerateRequest, GenerateCharacterResponse>(
    '/generate/character',
    { selectedTags },
    { signal },
  );
  return res.result;
}

export async function generateWorldview(
  selectedTags: Tag[],
  signal?: AbortSignal,
): Promise<WorldviewResult> {
  const res = await apiPost<GenerateRequest, GenerateWorldviewResponse>(
    '/generate/worldview',
    { selectedTags },
    { signal },
  );
  return res.result;
}
