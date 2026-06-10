// 章节生成 / 单章插入 服务
//
// 章节是故事的衍生品，三个端点都基于"当前故事文本"工作：
// - generateStoryChapters: 把故事拆成 N 章
// - insertStoryChapter: 在已有章节列表的指定位置插入一个新章节

import { apiPost } from './apiClient';
import type {
  StoryChapter,
  StoryChaptersRequest,
  StoryChaptersResponse,
  InsertStoryChapterRequest,
  InsertStoryChapterResponse,
} from '../types';

export async function generateStoryChapters(
  body: StoryChaptersRequest,
  signal?: AbortSignal,
): Promise<StoryChapter[]> {
  const res = await apiPost<StoryChaptersRequest, StoryChaptersResponse>(
    '/generate/story/chapters',
    body,
    { timeoutMs: 90_000, signal },
  );
  return res.chapters;
}

export async function insertStoryChapter(
  body: InsertStoryChapterRequest,
  signal?: AbortSignal,
): Promise<StoryChapter> {
  const res = await apiPost<InsertStoryChapterRequest, InsertStoryChapterResponse>(
    '/generate/story/chapter/insert',
    body,
    { timeoutMs: 60_000, signal },
  );
  return res.chapter;
}
