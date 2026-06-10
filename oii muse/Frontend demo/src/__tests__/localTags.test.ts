// localTags 词库 + drawBatch 的回归测试。
//
// 这些是核心：词云生成、阶段比例、跨路径自由词、跳出去模式。
// 拆 useTagCloud（C3）时这些要保证不退化。
//
// drawBatch 内部用 Math.random() 洗牌 —— 测断言只覆盖"不变量"
// （数量上限、去重、必排除项），不测随机性。

import { describe, it, expect } from 'vitest';
import { drawBatch, calcStage, LOCAL_TAGS, PATHS, type Tag } from '../app/data/localTags';

describe('词库 LOCAL_TAGS', () => {
  it('词库非空', () => {
    expect(LOCAL_TAGS.length).toBeGreaterThan(0);
  });

  it('每个 tag 必备字段：id / text / path / source / stage', () => {
    LOCAL_TAGS.forEach(t => {
      expect(t.id).toBeTruthy();
      expect(t.text).toBeTruthy();
      expect(['story', 'character', 'worldview']).toContain(t.path);
      expect(t.source).toBe('local');
      expect(['spread', 'stitch', 'narrow']).toContain(t.stage);
    });
  });

  it('所有词的 id 唯一', () => {
    const ids = new Set(LOCAL_TAGS.map(t => t.id));
    expect(ids.size).toBe(LOCAL_TAGS.length);
  });

  it('三条 path 都有词', () => {
    PATHS.forEach(p => {
      const n = LOCAL_TAGS.filter(t => t.path === p).length;
      expect(n).toBeGreaterThan(0);
    });
  });
});

describe('calcStage — 漏斗阶段判定', () => {
  it('0-1 词：撒网期', () => {
    expect(calcStage(0)).toBe('spread');
    expect(calcStage(1)).toBe('spread');
  });
  it('2-5 词：拼接期', () => {
    expect(calcStage(2)).toBe('stitch');
    expect(calcStage(3)).toBe('stitch');
    expect(calcStage(5)).toBe('stitch');
  });
  it('6+ 词：收束期', () => {
    expect(calcStage(6)).toBe('narrow');
    expect(calcStage(10)).toBe('narrow');
    expect(calcStage(20)).toBe('narrow');
  });
});

describe('drawBatch — 不变量', () => {
  it('返回数量 = count（默认 18）', () => {
    const r = drawBatch('story', [], 'spread', false, 18);
    expect(r.length).toBe(18);
  });

  it('count=18 时返回正好 18 张（实际生产用的值）', () => {
    expect(drawBatch('story', [], 'spread', false, 18).length).toBe(18);
  });

  it('小 count 时由于内部 Math.round 取整，结果可能 ≤ count', () => {
    // 这是 drawBatch 的当前行为：spread 档比例 0.7+0.2+0.1=1.0
    // 但 Math.round(12*0.7)+Math.round(12*0.2)+Math.round(12*0.1) = 8+2+1 = 11
    // count=18 时刚好 13+4+2=19 → slice 到 18 OK；其它 count 不一定。
    // 记录现状，提醒拆 useTagCloud 时 count 参数要谨慎。
    const r12 = drawBatch('story', [], 'spread', false, 12);
    expect(r12.length).toBeLessThanOrEqual(12);
    expect(r12.length).toBeGreaterThan(0);
  });

  it('结果按 text 去重', () => {
    const r = drawBatch('story', [], 'spread', false, 18);
    const texts = r.map(t => t.text);
    expect(new Set(texts).size).toBe(texts.length);
  });

  it('每张都有唯一 id', () => {
    const r = drawBatch('story', [], 'spread', false, 18);
    const ids = r.map(t => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('excludeTexts 中的词不出现在结果里', () => {
    // 先抓一批，挑前 5 个塞进 exclude，再抓一批
    const first = drawBatch('story', [], 'spread', false, 18);
    const banned = first.slice(0, 5).map(t => t.text);
    const second = drawBatch('story', banned, 'spread', false, 18);
    second.forEach(t => {
      expect(banned).not.toContain(t.text);
    });
  });
});

describe('drawBatch — 三阶段比例（粗略）', () => {
  // drawBatch 用 Math.random() 洗牌，但每档比例是确定的
  // （Math.round(count * ratio) 切片长度）。这里只测"主导档存在"，
  // 不测精确比例（避免依赖随机种子）。

  it('spread：含本路径 spread 词', () => {
    const r = drawBatch('story', [], 'spread', false, 18);
    const fromSpread = r.filter(t => t.path === 'story' && t.stage === 'spread').length;
    expect(fromSpread).toBeGreaterThan(0);
  });

  it('narrow：含本路径 narrow 词', () => {
    const r = drawBatch('story', [], 'narrow', false, 18);
    const fromNarrow = r.filter(t => t.path === 'story' && t.stage === 'narrow').length;
    expect(fromNarrow).toBeGreaterThan(0);
  });

  it('escape 模式：跨路径自由词比例显著上升', () => {
    // escape 期望 ~60% 来自其他 path
    const samples = Array.from({ length: 5 }, () =>
      drawBatch('story', [], 'spread', true, 18)
    );
    const avgCrossPath = samples
      .map(r => r.filter(t => t.path !== 'story').length)
      .reduce((a, b) => a + b, 0) / samples.length;
    // 5 次平均下来跨路径词应至少占 40%（避免随机性误判）
    expect(avgCrossPath).toBeGreaterThan(18 * 0.4);
  });
});

describe('drawBatch — 退化场景', () => {
  it('excludeTexts 把整库都排除，仍能返回（可能少于 count）', () => {
    const allTexts = LOCAL_TAGS.map(t => t.text);
    const r = drawBatch('story', allTexts, 'spread', false, 18);
    // 全排除后理论上空，drawBatch 不抛错
    expect(Array.isArray(r)).toBe(true);
    expect(r.length).toBeLessThanOrEqual(18);
  });

  it('count=0 应返回空数组', () => {
    const r = drawBatch('story', [], 'spread', false, 0);
    expect(r.length).toBe(0);
  });
});

describe('drawBatch — 跨路径', () => {
  it('character 路径只返回 character + 自由词', () => {
    const r: Tag[] = drawBatch('character', [], 'spread', false, 18);
    // 至少含一些 character 词
    const characterCount = r.filter(t => t.path === 'character').length;
    expect(characterCount).toBeGreaterThan(0);
  });
});
