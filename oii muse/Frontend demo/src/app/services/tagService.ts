// 动态词卡服务 — selectedTags 变化后由 Fairy 在后台调用预生成下一批 AI 词卡。

import { apiPost } from './apiClient';
import type {
  Tag,
  CreationPath,
  FunnelStage,
  DynamicCloudRequest,
  DynamicCloudResponse,
} from '../types';

interface FetchOptions {
  excludeTexts?: string[];
  count?: number;
  escape?: boolean;
  signal?: AbortSignal;
}

export function makeStateKey(
  path: CreationPath,
  stage: FunnelStage,
  selectedTags: Tag[],
  escape: boolean,
): string {
  // 同一组 path/stage/selected/escape 视为同一个生成请求；selectedTags
  // 用 text 拼接，顺序无关，保证 useEffect 重复触发不会拉相同的词。
  const sig = selectedTags.map(t => t.text).sort().join('|');
  return `${path}:${stage}:${sig}:${escape ? 1 : 0}`;
}

export async function fetchDynamicCloud(
  path: CreationPath,
  stage: FunnelStage,
  selectedTags: Tag[],
  opts: FetchOptions = {},
): Promise<DynamicCloudResponse> {
  const { excludeTexts = [], count = 18, escape = false, signal } = opts;
  const stateKey = makeStateKey(path, stage, selectedTags, escape);

  const body: DynamicCloudRequest = {
    stateKey, path, stage, selectedTags,
    excludeTexts, count, escape, mode: 'prefetch',
  };
  return apiPost<DynamicCloudRequest, DynamicCloudResponse>(
    '/tags/dynamic-cloud',
    body,
    { signal, timeoutMs: 45_000 },
  );
}
