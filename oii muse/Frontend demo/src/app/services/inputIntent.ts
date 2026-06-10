// 输入意图解析 — 单输入框的路由逻辑。
//
// 规则：
// 1. 纯数字 → 章节生成
// 2. 显式指向单章（"第 N 章 ..."）→ refine
// 3. 包含数字 + "章" 关键字 → 章节生成（覆盖各种动词/量词组合）
// 4. 极短输入（≤6 字）以数字开头、不含动词，视为章节意图（如"3 个"/"3章"）
// 5. 其他全部交给后端 smart refine

const CN_NUM: Record<string, number> = {
  一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5,
  六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
  十一: 11, 十二: 12, 十三: 13, 十四: 14, 十五: 15,
  十六: 16, 十七: 17, 十八: 18, 十九: 19, 二十: 20,
};

export type InputIntent =
  | { kind: 'chapters'; count: number }
  | { kind: 'refine'; text: string }
  | { kind: 'invalid'; reason: string }
  | { kind: 'empty' };

const MIN = 1;
const MAX = 20;

function parseNum(s: string): number | null {
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  if (s in CN_NUM) return CN_NUM[s];
  return null;
}

// 显式指向某一章 → 走 refine
const SINGLE_CHAPTER_RE = /第\s*[\d一二三四五六七八九十]+\s*章/;

// 包含数字 + "章"。从全文里抓首个"数字 (?:个|段)? 章(?:节)?"片段。
const CHAPTER_KEYWORD_RE =
  /([\d一二三四五六七八九十两]+)\s*(?:个|段|个章|段章)?\s*章(?:节)?/;

// 极短输入：以数字开头、可带"个/段"等量词，不含动词修饰
// 如 "3"、"3个"、"3 段"、"三个"
const SHORT_NUMERIC_RE =
  /^([\d一二三四五六七八九十两]+)\s*(?:个|段|章|章节)?\s*$/;

export function parseIntent(input: string): InputIntent {
  const t = input.trim();
  if (!t) return { kind: 'empty' };

  // 1. 纯数字捷径
  if (/^\d+$/.test(t)) {
    const n = parseInt(t, 10);
    if (n < MIN || n > MAX) {
      return { kind: 'invalid', reason: `章节数请填 ${MIN}-${MAX}` };
    }
    return { kind: 'chapters', count: n };
  }

  // 2. 显式指向单章 → refine
  if (SINGLE_CHAPTER_RE.test(t)) {
    if (t.length < 2) return { kind: 'empty' };
    return { kind: 'refine', text: t };
  }

  // 3. 短数量短语（如 "3 个" / "三个" / "5 段"）
  const short = t.match(SHORT_NUMERIC_RE);
  if (short) {
    const n = parseNum(short[1]);
    if (n !== null) {
      if (n < MIN || n > MAX) {
        return { kind: 'invalid', reason: `章节数请填 ${MIN}-${MAX}` };
      }
      return { kind: 'chapters', count: n };
    }
  }

  // 4. 含"章"关键字 + 数字
  if (/章/.test(t)) {
    const m = t.match(CHAPTER_KEYWORD_RE);
    if (m) {
      const n = parseNum(m[1]);
      if (n !== null) {
        if (n < MIN || n > MAX) {
          return { kind: 'invalid', reason: `章节数请填 ${MIN}-${MAX}` };
        }
        return { kind: 'chapters', count: n };
      }
    }
  }

  // 5. 其他全部交给 AI 路由
  if (t.length < 2) return { kind: 'empty' };
  return { kind: 'refine', text: t };
}
