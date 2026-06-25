"""Service for /result/refresh-swaps.

只刷新调味词卡（保留结果与配方），走 cheap 模型（gpt-4o-mini）的 call_tag_ai。
预期延迟 1-2 秒，独立 cheap 限流桶，与 expensive 桶分流避免高频 🔄 挤兑生成。
"""

from __future__ import annotations

import json
import logging

import httpx

from app.prompts.refresh_swaps import (
    REFRESH_SWAPS_SYSTEM,
    REFRESH_SWAPS_USER_TEMPLATE,
)
from app.schemas.chat import RefreshSwapsRequest, RefreshSwapsResponse
from app.schemas.result import SwapBatch, SwapCard
from app.services.ai_provider import AIError, call_tag_ai
from app.services.json_utils import extract_json

log = logging.getLogger(__name__)


# 防御性长度，与 recipe_utils 中的常量保持一致
_LABEL_MAX = 12
_PREVIEW_MAX = 60


def _norm(s: object, *, limit: int) -> str:
    if not isinstance(s, str):
        return ""
    return s.strip()[:limit]


def _coerce_cards(raw: object, expected_fields: list[str]) -> SwapBatch | None:
    """宽松解析 cards：必须 3 个 key 严格等于 expected_fields，每槽 3 张。
    任意失败返回 None，由调用方降级。"""
    if not isinstance(raw, dict):
        return None
    cards_raw = raw.get("cards")
    if not isinstance(cards_raw, dict):
        return None
    out: dict[str, list[SwapCard]] = {}
    for field in expected_fields:
        arr = cards_raw.get(field)
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
        out[field] = cards
    return SwapBatch(cards=out)


async def refresh_swaps(
    client: httpx.AsyncClient,
    req: RefreshSwapsRequest,
) -> RefreshSwapsResponse:
    expected_fields = [s.field for s in req.recipe.slots]
    user_prompt = REFRESH_SWAPS_USER_TEMPLATE.format(
        path=req.path,
        outline=req.outline,
        recipe_json=json.dumps(req.recipe.model_dump(), ensure_ascii=False),
        exclude_json=json.dumps(req.excludeSwapTexts, ensure_ascii=False),
    )
    try:
        # 走 cheap 模型：低延迟、低成本、独立配额
        raw = await call_tag_ai(
            client,
            REFRESH_SWAPS_SYSTEM,
            user_prompt,
            temperature=0.85,
            timeout=15.0,
        )
        try:
            data = extract_json(raw)
        except ValueError as e:
            raise AIError(f"refresh_swaps JSON parse failed ({e})") from e
        swaps = _coerce_cards(data, expected_fields)
        if swaps is None:
            raise AIError("refresh_swaps: cards format invalid")
        return RefreshSwapsResponse(swaps=swaps, degraded=False)
    except (AIError, ValueError) as e:
        log.warning("refresh_swaps: failed (%s); returning degraded", e)
        return RefreshSwapsResponse(
            swaps=None, degraded=True, degradeReason=str(e),
        )


__all__ = ["refresh_swaps"]
