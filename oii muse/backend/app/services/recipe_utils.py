"""调味词卡 v1：宽松解析 LLM 输出的 recipe / swaps，三路径共用。

设计原则：解析失败一律返回 None，不 raise——让调用方拿到一个有 outline 没 swaps
的结果至少能显示故事，而不是整个生成失败。

字段池白名单见 STORY_FIELDS / CHARACTER_FIELDS / WORLDVIEW_FIELDS。
保持与前端 data/recipeSlots.ts 严格一致。
"""

from __future__ import annotations

import logging

from app.schemas.result import Recipe, RecipeSlot, SwapBatch, SwapCard

log = logging.getLogger(__name__)


# ─── Field pools ──────────────────────────────────────────────────────────────
# 必须与前端 data/recipeSlots.ts 完全一致。
# v1.2 起每路径钦定 3 个方向（不再随机），prompt 也只允许这 3 个 field。

STORY_FIELDS: set[str] = {"character", "conflict", "worldview"}
CHARACTER_FIELDS: set[str] = {"identity", "wound", "desire"}
WORLDVIEW_FIELDS: set[str] = {"coreRule", "taboo", "conflictHooks"}


# ─── Coercion ─────────────────────────────────────────────────────────────────
# 长度上限稍宽于产品规则（label 2-6 / preview 15-25），给 LLM 一点容错。
# UI 那边视觉上也能容忍。下限放宽到 1 字符避免空字段直接整体作废。

_LABEL_MAX = 12
_PREVIEW_MAX = 60
_VALUE_MAX = 32


def _norm(s: object, *, limit: int) -> str:
    if not isinstance(s, str):
        return ""
    return s.strip()[:limit]


def coerce_recipe(raw: object, *, allowed_fields: set[str]) -> Recipe | None:
    """宽松解析 recipe。要求恰好 3 个不重复字段，全在白名单内。"""
    if not isinstance(raw, dict):
        return None
    slots_raw = raw.get("slots")
    if not isinstance(slots_raw, list) or len(slots_raw) != 3:
        return None
    seen: set[str] = set()
    out: list[RecipeSlot] = []
    for s in slots_raw:
        if not isinstance(s, dict):
            return None
        field = _norm(s.get("field"), limit=_VALUE_MAX)
        value = _norm(s.get("value"), limit=_VALUE_MAX)
        if not field or field not in allowed_fields or field in seen or not value:
            return None
        seen.add(field)
        out.append(RecipeSlot(field=field, value=value))
    return Recipe(slots=out)


def coerce_swaps(raw: object, recipe: Recipe | None) -> SwapBatch | None:
    """宽松解析 swaps。key 必须等于 recipe.slots[i].field；每槽恰好 3 张词卡。"""
    if recipe is None or not isinstance(raw, dict):
        return None
    cards_raw = raw.get("cards")
    if not isinstance(cards_raw, dict):
        return None
    out: dict[str, list[SwapCard]] = {}
    for slot in recipe.slots:
        arr = cards_raw.get(slot.field)
        if not isinstance(arr, list) or len(arr) != 3:
            return None
        cards: list[SwapCard] = []
        for c in arr:
            if not isinstance(c, dict):
                return None
            label = _norm(c.get("label"), limit=_LABEL_MAX)
            preview = _norm(c.get("preview"), limit=_PREVIEW_MAX)
            if not label or not preview:
                return None
            cards.append(SwapCard(label=label, preview=preview))
        out[slot.field] = cards
    return SwapBatch(cards=out)


__all__ = [
    "STORY_FIELDS", "CHARACTER_FIELDS", "WORLDVIEW_FIELDS",
    "coerce_recipe", "coerce_swaps",
]
