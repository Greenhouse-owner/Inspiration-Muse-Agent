"""Extract a JSON object/array from a model response.

The model is asked for strict JSON, but reasoning models occasionally:
  1. wrap the JSON in ```json … ``` fences,
  2. prepend/append a sentence,
  3. emit smart quotes / full-width punctuation around the body.

This module tries a small ladder of strategies and returns the first one
that parses, raising ValueError if nothing works.
"""

import json
import re

_FENCE_RE = re.compile(r"```(?:json|JSON)?\s*\n?(.*?)\n?```", re.DOTALL)


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

    # 4. balanced array scan (rare, but covers tag-list responses)
    arr = _scan_balanced(text, "[", "]")
    if arr:
        try:
            return json.loads(arr)
        except json.JSONDecodeError:
            pass

    raise ValueError("Failed to extract valid JSON from AI response")
