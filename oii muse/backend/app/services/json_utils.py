"""Extract a JSON object/array from a model response.

The model is asked for strict JSON, but reasoning models occasionally:
  1. wrap the JSON in ```json … ``` fences,
  2. prepend/append a sentence,
  3. emit smart quotes / full-width punctuation around the body,
  4. **use bare english double-quotes inside string values**
     (e.g. "我爱你" inside a content field) — breaks JSON parsing.

This module tries a small ladder of strategies and returns the first one
that parses, raising ValueError if nothing works.
"""

import json
import re

_FENCE_RE = re.compile(r"```(?:json|JSON)?\s*\n?(.*?)\n?```", re.DOTALL)

# 兜底修复：英文双引号在中文字符或中文标点之间出现时（如 "我爱你"），换成中文引号。
# 限定两侧都必须是中文字符或中文标点，避免破坏真正的 JSON 控制符（key/value 边界的 "）。
# 范围：
#   一-鿿 = CJK Unified Ideographs (U+4E00–U+9FFF)
#   ＀-？ = CJK 全角标点（U+3000–U+303F + U+FF00–U+FFEF 的部分）
_CJK_LIKE = r"[一-鿿　-〿＀-￯]"
_BARE_QUOTE_RE = re.compile(rf'(?<={_CJK_LIKE})"(?={_CJK_LIKE})')

# 替换为中文左双引号（U+201C），用 \u 转义避免源码中的 ASCII 双引号歧义
_FANCY_QUOTE = "“"


def _scan_balanced(text: str, opener: str, closer: str) -> str | None:
    """Return the first balanced opener…closer span, ignoring chars inside JSON
    strings (which may themselves contain unbalanced braces)."""
    depth = 0
    start = -1
    in_str = False
    escape = False
    for i, ch in enumerate(text):
        if in_str:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
            continue
        if ch == opener:
            if depth == 0:
                start = i
            depth += 1
        elif ch == closer:
            if depth == 0:
                continue
            depth -= 1
            if depth == 0 and start >= 0:
                return text[start : i + 1]
    return None


def extract_json(text: str) -> dict | list:
    """Extract JSON from AI model response text. Returns the parsed value."""
    # 1. direct
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # 1b. 修复中文字符之间的裸英文双引号（LLM 偶尔会写 "我爱你" 而不是 「我爱你」）
    fixed = _BARE_QUOTE_RE.sub(_FANCY_QUOTE, text)
    if fixed != text:
        try:
            return json.loads(fixed)
        except json.JSONDecodeError:
            pass

    # 2. fenced code block
    fence_match = _FENCE_RE.search(text)
    if fence_match:
        body = fence_match.group(1).strip()
        try:
            return json.loads(body)
        except json.JSONDecodeError:
            pass

    # 3. balanced object scan (robust to leading/trailing prose)
    obj = _scan_balanced(text, "{", "}")
    if obj:
        try:
            return json.loads(obj)
        except json.JSONDecodeError:
            pass
        # 同样对 balanced object 做一次裸引号修复
        obj_fixed = _BARE_QUOTE_RE.sub(_FANCY_QUOTE, obj)
        if obj_fixed != obj:
            try:
                return json.loads(obj_fixed)
            except json.JSONDecodeError:
                pass

    # 4. balanced array scan (rare, but covers tag-list responses)
    arr = _scan_balanced(text, "[", "]")
    if arr:
        try:
            return json.loads(arr)
        except json.JSONDecodeError:
            pass

    raise ValueError("Failed to extract valid JSON from AI response")
