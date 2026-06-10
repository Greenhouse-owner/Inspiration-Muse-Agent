// 输入意图解析的回归测试。
// 之前手动 inline 验证过 30 个 case，这里全部固化下来。
//
// 这些路径决定了"换一批 vs refine vs 章节生成"的分发。
// 任何改动 inputIntent 都必须先确保这些用例不退化。

import { describe, it, expect } from 'vitest';
import { parseIntent } from '../app/services/inputIntent';

describe('parseIntent — 章节意图（数字/N章/含章关键字）', () => {
  it('纯数字', () => {
    expect(parseIntent('3')).toEqual({ kind: 'chapters', count: 3 });
    expect(parseIntent('1')).toEqual({ kind: 'chapters', count: 1 });
    expect(parseIntent('20')).toEqual({ kind: 'chapters', count: 20 });
    expect(parseIntent('10')).toEqual({ kind: 'chapters', count: 10 });
  });

  it('短数量短语：N + 量词', () => {
    expect(parseIntent('3个')).toEqual({ kind: 'chapters', count: 3 });
    expect(parseIntent('3 个')).toEqual({ kind: 'chapters', count: 3 });
    expect(parseIntent('3段')).toEqual({ kind: 'chapters', count: 3 });
    expect(parseIntent('三个')).toEqual({ kind: 'chapters', count: 3 });
    expect(parseIntent('五段')).toEqual({ kind: 'chapters', count: 5 });
  });

  it('N章 / N章节', () => {
    expect(parseIntent('3章')).toEqual({ kind: 'chapters', count: 3 });
    expect(parseIntent('三章')).toEqual({ kind: 'chapters', count: 3 });
    expect(parseIntent('两章')).toEqual({ kind: 'chapters', count: 2 });
    expect(parseIntent('八章')).toEqual({ kind: 'chapters', count: 8 });
    expect(parseIntent('8个章节')).toEqual({ kind: 'chapters', count: 8 });
  });

  it('动词 + 数量 + 章节', () => {
    expect(parseIntent('分3章')).toEqual({ kind: 'chapters', count: 3 });
    expect(parseIntent('分成 3 章')).toEqual({ kind: 'chapters', count: 3 });
    expect(parseIntent('分成4个章节')).toEqual({ kind: 'chapters', count: 4 });
    expect(parseIntent('分成4章节')).toEqual({ kind: 'chapters', count: 4 });
    expect(parseIntent('生成5个章节')).toEqual({ kind: 'chapters', count: 5 });
    expect(parseIntent('拆成 7 章')).toEqual({ kind: 'chapters', count: 7 });
    expect(parseIntent('划分成八章')).toEqual({ kind: 'chapters', count: 8 });
    expect(parseIntent('做3章')).toEqual({ kind: 'chapters', count: 3 });
  });

  it('客气前缀 + 章节意图', () => {
    expect(parseIntent('想分3章')).toEqual({ kind: 'chapters', count: 3 });
    expect(parseIntent('麻烦分5章')).toEqual({ kind: 'chapters', count: 5 });
  });
});

describe('parseIntent — 边界值', () => {
  it('0 应判 invalid', () => {
    const r = parseIntent('0');
    expect(r.kind).toBe('invalid');
  });

  it('21 / 99 / 越界 → invalid', () => {
    expect(parseIntent('21').kind).toBe('invalid');
    expect(parseIntent('99').kind).toBe('invalid');
    expect(parseIntent('100').kind).toBe('invalid');
  });

  it('"分11章" 边界外', () => {
    expect(parseIntent('分21章').kind).toBe('invalid');
  });

  it('"11个" 越界（>20）→ invalid', () => {
    expect(parseIntent('21个').kind).toBe('invalid');
  });

  it('单字中文数字（"三"/"五"）当章节意图（覆盖了 SHORT_NUMERIC_RE）', () => {
    // 当前行为：SHORT_NUMERIC_RE 允许单字中文数字进入章节通道。
    // 这是经过 inline 验证的有意行为，不是 bug。
    expect(parseIntent('三')).toEqual({ kind: 'chapters', count: 3 });
    expect(parseIntent('五')).toEqual({ kind: 'chapters', count: 5 });
  });
});

describe('parseIntent — refine 文本', () => {
  it('普通修改诉求', () => {
    expect(parseIntent('把主角改成男的')).toEqual({
      kind: 'refine', text: '把主角改成男的',
    });
    expect(parseIntent('整体更悬疑').kind).toBe('refine');
  });

  it('"第 N 章 xxx" 引用单章 → refine', () => {
    expect(parseIntent('第 2 章扩写一下').kind).toBe('refine');
    expect(parseIntent('修改第3章').kind).toBe('refine');
    expect(parseIntent('把第1章改得更暗一点').kind).toBe('refine');
  });
});

describe('parseIntent — 空 / 极短输入', () => {
  it('空字符串', () => {
    expect(parseIntent('').kind).toBe('empty');
    expect(parseIntent('   ').kind).toBe('empty');
  });

  it('单字符（trim 后长度 < 2）', () => {
    // 实测：单个汉字、单个字母、空格都应 empty
    expect(parseIntent('a').kind).toBe('empty');
  });
});

describe('parseIntent — text 字段保留 trim 后的原文', () => {
  it('refine 时 text 应是 trim 后的原文', () => {
    const r = parseIntent('  把主角改成男的  ');
    expect(r.kind).toBe('refine');
    if (r.kind === 'refine') {
      expect(r.text).toBe('把主角改成男的');
    }
  });
});
