// service 层的回归测试。
//
// 这些 service 是 Fairy.tsx 与后端的薄封装层。每条都做：
//   1. 调对 endpoint
//   2. body 字段名/结构与后端 schema 对齐
//   3. 解包对响应
//
// 任何 wire format 改动都应触发这里的测试调整 ——
// 这是 plan-bc 里 D 阶段做 codegen 之前的"手动同步"安全网。

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  generateStory, generateCharacter, generateWorldview,
} from '../app/services/generateService';
import { refineResult, refineSmart } from '../app/services/refineService';
import {
  generateStoryChapters, insertStoryChapter,
} from '../app/services/chapterService';
import {
  fetchDynamicCloud, makeStateKey,
} from '../app/services/tagService';
import type {
  Tag, StoryResult, CharacterResult, WorldviewResult,
  CurrentResult, StoryChapter,
} from '../app/types';


const originalFetch = global.fetch;

beforeEach(() => {
  global.fetch = vi.fn();
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

function mockFetchOk(body: unknown) {
  (global.fetch as any).mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => body,
  });
}

function lastFetchCall() {
  const calls = (global.fetch as any).mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  const [url, init] = calls[calls.length - 1];
  return {
    url: String(url),
    method: init.method,
    body: init.body ? JSON.parse(init.body) : undefined,
    headers: init.headers,
  };
}

const sampleTag: Tag = {
  id: 't1', text: '末班列车', path: 'story', source: 'user',
};


describe('generateStory / Character / Worldview', () => {
  it('generateStory → POST /generate/story', async () => {
    const story: StoryResult = { content: '一个故事' };
    mockFetchOk({ path: 'story', result: story });
    const r = await generateStory([sampleTag]);
    expect(r).toEqual(story);
    const call = lastFetchCall();
    expect(call.url).toContain('/generate/story');
    expect(call.method).toBe('POST');
    expect(call.body).toEqual({ selectedTags: [sampleTag] });
  });

  it('generateCharacter → POST /generate/character', async () => {
    const character: CharacterResult = {
      name: '阿星', identity: 'X', personality: 'Y',
      wound: 'a', desire: 'b', fear: 'c', secret: 'd', arc: 'e',
    };
    mockFetchOk({ path: 'character', result: character });
    const r = await generateCharacter([sampleTag]);
    expect(r).toEqual(character);
    expect(lastFetchCall().url).toContain('/generate/character');
  });

  it('generateWorldview → POST /generate/worldview', async () => {
    const worldview: WorldviewResult = {
      title: 'X', coreRule: 'Y', cost: 'a',
      taboo: 'b', socialImpact: 'c', conflictHooks: ['hook1'],
    };
    mockFetchOk({ path: 'worldview', result: worldview });
    const r = await generateWorldview([sampleTag]);
    expect(r).toEqual(worldview);
    expect(lastFetchCall().url).toContain('/generate/worldview');
  });
});


describe('refineResult / refineSmart', () => {
  it('refineResult → POST /result/refine + 完整字段', async () => {
    const cur: CurrentResult = {
      resultType: 'story',
      story: { content: '原版' },
    };
    mockFetchOk({ result: { resultType: 'story', story: { content: '改后' } } });
    const r = await refineResult('story', [sampleTag], cur, '改成男的');
    expect(r.result.resultType).toBe('story');
    const call = lastFetchCall();
    expect(call.url).toContain('/result/refine');
    expect(call.body).toEqual({
      path: 'story',
      selectedTags: [sampleTag],
      currentResult: cur,
      userRequest: '改成男的',
    });
  });

  it('refineSmart → POST /result/refine-smart + 含 chapters', async () => {
    const story: StoryResult = { content: '原文' };
    const chapters: StoryChapter[] = [
      { index: 1, title: '第一章', summary: '...' },
    ];
    mockFetchOk({ targets: ['story'], story: { content: '新文' }, note: 'ok' });
    await refineSmart([sampleTag], '改写', story, chapters);
    const call = lastFetchCall();
    expect(call.url).toContain('/result/refine-smart');
    expect(call.body.story).toEqual(story);
    expect(call.body.chapters).toEqual(chapters);
    expect(call.body.instruction).toBe('改写');
  });

  it('refineSmart → 当 chapters 为空数组时 body 不带 chapters', async () => {
    const story: StoryResult = { content: '原文' };
    mockFetchOk({ targets: ['story'], story: { content: '新' } });
    await refineSmart([sampleTag], '改写', story, []);
    const call = lastFetchCall();
    expect(call.body.chapters).toBeUndefined();
  });

  it('refineSmart → chapters undefined 时 body 不带 chapters', async () => {
    const story: StoryResult = { content: '原文' };
    mockFetchOk({ targets: ['story'], story: { content: '新' } });
    await refineSmart([sampleTag], '改写', story, undefined);
    const call = lastFetchCall();
    expect(call.body.chapters).toBeUndefined();
  });
});


describe('chapter services', () => {
  it('generateStoryChapters → POST + 返回 chapters 数组', async () => {
    const chapters: StoryChapter[] = [
      { index: 1, title: '一', summary: 'a' },
      { index: 2, title: '二', summary: 'b' },
    ];
    mockFetchOk({ chapters });
    const r = await generateStoryChapters({ story: 'long enough story...', chapterCount: 2 });
    expect(r).toEqual(chapters);
    const call = lastFetchCall();
    expect(call.url).toContain('/generate/story/chapters');
    expect(call.body).toEqual({ story: 'long enough story...', chapterCount: 2 });
  });

  it('insertStoryChapter → 返回单 chapter', async () => {
    const chapter: StoryChapter = { index: 0, title: '过渡', summary: 'x' };
    mockFetchOk({ chapter });
    const existing: StoryChapter[] = [{ index: 1, title: '一', summary: 'a' }];
    const r = await insertStoryChapter({
      story: '...',
      chapters: existing,
      insertAfterIndex: 1,
    });
    expect(r).toEqual(chapter);
    const call = lastFetchCall();
    expect(call.url).toContain('/generate/story/chapter/insert');
    expect(call.body).toEqual({
      story: '...',
      chapters: existing,
      insertAfterIndex: 1,
    });
  });
});


describe('tag service', () => {
  it('makeStateKey 由 path/stage/selectedTags(text 字典序)/escape 派生', () => {
    const tagsA: Tag[] = [
      { id: 'a', text: '末班列车', path: 'story', source: 'user' },
      { id: 'b', text: '侦探',     path: 'character', source: 'user' },
    ];
    const tagsB: Tag[] = [...tagsA].reverse();
    const k1 = makeStateKey('story', 'spread', tagsA, false);
    const k2 = makeStateKey('story', 'spread', tagsB, false);
    expect(k1).toBe(k2); // 顺序无关
  });

  it('makeStateKey escape=true 与 false 应不同', () => {
    const tags: Tag[] = [];
    const a = makeStateKey('story', 'spread', tags, false);
    const b = makeStateKey('story', 'spread', tags, true);
    expect(a).not.toBe(b);
  });

  it('fetchDynamicCloud → POST /tags/dynamic-cloud + body 含 stateKey', async () => {
    mockFetchOk({
      stateKey: 'k', path: 'story', stage: 'spread',
      analysis: { storySeed: '', currentGoal: '', missing: [], tone: '未定型' },
      tags: [],
    });
    await fetchDynamicCloud('story', 'spread', [], { count: 10 });
    const call = lastFetchCall();
    expect(call.url).toContain('/tags/dynamic-cloud');
    expect(call.body.path).toBe('story');
    expect(call.body.stage).toBe('spread');
    expect(call.body.count).toBe(10);
    expect(call.body.escape).toBe(false);
    expect(call.body.mode).toBe('prefetch');
    expect(call.body.stateKey).toBeTruthy();
  });

  it('fetchDynamicCloud → 默认 count=18', async () => {
    mockFetchOk({
      stateKey: 'k', path: 'story', stage: 'spread',
      analysis: { storySeed: '', currentGoal: '', missing: [], tone: '未定型' },
      tags: [],
    });
    await fetchDynamicCloud('story', 'spread', []);
    const call = lastFetchCall();
    expect(call.body.count).toBe(18);
  });
});
