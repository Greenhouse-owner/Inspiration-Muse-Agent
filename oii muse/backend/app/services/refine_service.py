"""Service for /result/refine.

三种 resultType 各自有不同的协议：
- story: AI 输出纯文本，整段替换 story.content
- character / worldview: AI 输出 JSON 增量 patch，按英文 schema key merge
  到原对象上（未提及字段保留原值）

这样字段名永远不会跑偏 —— 中文 label / 同义词由 AI 在生成 JSON 时自己消化。

降级：AI 不可达或 JSON 不合法时走本地 mock，确保 UI 总能拿到一个结构化 result。
"""

import json
import logging
import random

import httpx

from app.prompts.refine import (
    REFINE_SYSTEM_CHARACTER,
    REFINE_SYSTEM_STORY,
    REFINE_SYSTEM_WORLDVIEW,
    REFINE_USER_TEMPLATE,
)
from app.prompts.refine_smart import (
    REFINE_SMART_SYSTEM,
    REFINE_SMART_USER_TEMPLATE,
)
from app.schemas.chat import (
    CurrentResult,
    RefineRequest,
    RefineResponse,
    RefineSmartRequest,
    RefineSmartResponse,
)
from app.schemas.result import (
    CharacterResult,
    StoryChapterDTO,
    StoryResult,
    WorldviewResult,
)
from app.services.ai_provider import AIError, call_ai
from app.services.json_utils import extract_json
from app.services.recipe_utils import (
    CHARACTER_FIELDS,
    STORY_FIELDS,
    WORLDVIEW_FIELDS,
    coerce_recipe,
    coerce_swaps,
)

log = logging.getLogger(__name__)


# ─── Schema whitelists ────────────────────────────────────────────────────────

_CHARACTER_KEYS = {
    "name", "identity", "personality", "wound",
    "desire", "fear", "secret", "arc",
}
_WORLDVIEW_KEYS = {
    "title", "coreRule", "cost", "taboo", "socialImpact", "conflictHooks",
}


# ─── Prompt helpers ───────────────────────────────────────────────────────────

def _current_block(req: RefineRequest) -> str:
    cur = req.currentResult
    if cur.resultType == "story" and cur.story:
        return f"[story]\n{cur.story.content}"
    if cur.resultType == "character" and cur.character:
        return "[character]\n" + json.dumps(
            cur.character.model_dump(), ensure_ascii=False, indent=2
        )
    if cur.resultType == "worldview" and cur.worldview:
        return "[worldview]\n" + json.dumps(
            cur.worldview.model_dump(), ensure_ascii=False, indent=2
        )
    return f"[{cur.resultType}]\n（无可用上下文）"


def _tags_json(req: RefineRequest) -> str:
    return json.dumps(
        [{"text": t.text, "path": t.path, "source": t.source} for t in req.selectedTags],
        ensure_ascii=False,
    )


def _user_prompt(req: RefineRequest) -> str:
    return REFINE_USER_TEMPLATE.format(
        result_type=req.currentResult.resultType,
        selected_tags_json=_tags_json(req),
        current_result_block=_current_block(req),
        user_request=req.userRequest,
    )


# ─── JSON patch helpers ───────────────────────────────────────────────────────

def _filter_patch(patch: dict, allowed: set[str]) -> dict[str, object]:
    """只保留白名单内的 key，其它 key 静默丢弃（不抛错，避免一字段错误整体失败）。"""
    return {k: v for k, v in patch.items() if k in allowed}


def _apply_character_patch(
    original: CharacterResult, patch: dict[str, object],
) -> CharacterResult:
    cleaned = _filter_patch(patch, _CHARACTER_KEYS)
    # 所有 character 字段都是字符串，类型不对就丢弃
    cleaned = {k: v for k, v in cleaned.items() if isinstance(v, str) and v.strip()}
    return original.model_copy(update=cleaned) if cleaned else original


def _apply_worldview_patch(
    original: WorldviewResult, patch: dict[str, object],
) -> WorldviewResult:
    cleaned: dict[str, object] = {}
    for k, v in _filter_patch(patch, _WORLDVIEW_KEYS).items():
        if k == "conflictHooks":
            if isinstance(v, list) and all(isinstance(x, str) for x in v) and v:
                cleaned[k] = v
        elif isinstance(v, str) and v.strip():
            cleaned[k] = v
    return original.model_copy(update=cleaned) if cleaned else original


# ─── Mock fallback ────────────────────────────────────────────────────────────

_MOCK_PREFIXES = [
    '按照"{request}"调整了一下——\n\n',
    '好，试试这个方向（"{request}"）：\n\n',
]
_MOCK_ENDINGS = [
    "最终，一切悄悄落定。没有解释，没有道别，只是慢慢地变得安静了。",
    "她把那样东西放回原处，转身走进了另一扇一直开着的门。"
    "那扇门通向哪里没人知道，但她走得很稳。",
    "两个人沿原路走回去，没有说话，但肩膀靠得很近。外面的雨小了，天还没亮，但快了。",
]


def _mock_result(req: RefineRequest) -> CurrentResult:
    cur = req.currentResult
    if cur.resultType == "story" and cur.story:
        original = cur.story.content
        prefix = random.choice(_MOCK_PREFIXES).format(request=req.userRequest)
        half = original[: len(original) // 2]
        ending = random.choice(_MOCK_ENDINGS)
        return CurrentResult(
            resultType="story",
            story=StoryResult(content=f"{prefix}{half}……\n\n{ending}"),
        )

    if cur.resultType == "character" and cur.character:
        merged = cur.character.model_copy(update={
            "personality": f'{cur.character.personality}（按"{req.userRequest}"略调）',
            "arc": f'{cur.character.arc} 修改方向：{req.userRequest}',
        })
        return CurrentResult(resultType="character", character=merged)

    if cur.resultType == "worldview" and cur.worldview:
        merged = cur.worldview.model_copy(update={
            "coreRule": f'{cur.worldview.coreRule}（按"{req.userRequest}"调整）',
            "conflictHooks": [
                f'按"{req.userRequest}"新增冲突',
                *cur.worldview.conflictHooks[:2],
            ],
        })
        return CurrentResult(resultType="worldview", worldview=merged)

    return cur


# ─── Per-resultType pipelines ─────────────────────────────────────────────────

async def _refine_story(client: httpx.AsyncClient, req: RefineRequest) -> CurrentResult:
    raw = await call_ai(client, REFINE_SYSTEM_STORY, _user_prompt(req), temperature=0.85)
    content = raw.strip()
    if not content:
        raise AIError("empty refine content")
    return CurrentResult(resultType="story", story=StoryResult(content=content))


async def _refine_character(client: httpx.AsyncClient, req: RefineRequest) -> CurrentResult:
    assert req.currentResult.character is not None
    raw = await call_ai(client, REFINE_SYSTEM_CHARACTER, _user_prompt(req), temperature=0.7)
    try:
        patch = extract_json(raw)
    except ValueError as e:
        raise AIError(f"character refine: invalid JSON ({e})") from e
    if not isinstance(patch, dict):
        raise AIError(f"character refine: expected object, got {type(patch).__name__}")
    merged = _apply_character_patch(req.currentResult.character, patch)
    if merged is req.currentResult.character:
        raise AIError("character refine: patch contained no recognized fields")
    return CurrentResult(resultType="character", character=merged)


async def _refine_worldview(client: httpx.AsyncClient, req: RefineRequest) -> CurrentResult:
    assert req.currentResult.worldview is not None
    raw = await call_ai(client, REFINE_SYSTEM_WORLDVIEW, _user_prompt(req), temperature=0.7)
    try:
        patch = extract_json(raw)
    except ValueError as e:
        raise AIError(f"worldview refine: invalid JSON ({e})") from e
    if not isinstance(patch, dict):
        raise AIError(f"worldview refine: expected object, got {type(patch).__name__}")
    merged = _apply_worldview_patch(req.currentResult.worldview, patch)
    if merged is req.currentResult.worldview:
        raise AIError("worldview refine: patch contained no recognized fields")
    return CurrentResult(resultType="worldview", worldview=merged)


# ─── Public entry ─────────────────────────────────────────────────────────────

async def refine_result(
    client: httpx.AsyncClient,
    req: RefineRequest,
) -> RefineResponse:
    try:
        rt = req.currentResult.resultType
        if rt == "story":
            result = await _refine_story(client, req)
        elif rt == "character":
            result = await _refine_character(client, req)
        elif rt == "worldview":
            result = await _refine_worldview(client, req)
        else:
            raise AIError(f"unknown resultType: {rt}")
        return RefineResponse(result=result)
    except AIError as e:
        log.warning("refine_result: AI failed (%s); falling back to mock", e)
        return RefineResponse(result=_mock_result(req))


# ─── Smart refine (story + chapters) ─────────────────────────────────────────

_OFFLINE_NOTE = "（后端暂不可达，未能修改）"


def _smart_user_prompt(req: RefineSmartRequest) -> str:
    chapters_json = (
        json.dumps(
            [c.model_dump() for c in req.chapters],
            ensure_ascii=False,
        )
        if req.chapters
        else "null"
    )
    tags_json = json.dumps(
        [
            {"text": t.text, "path": t.path, "source": t.source}
            for t in req.selectedTags
        ],
        ensure_ascii=False,
    )
    swap_instructions_json = json.dumps(
        [s.model_dump() for s in req.swapInstructions],
        ensure_ascii=False,
    )
    recipe_json = (
        json.dumps(req.currentRecipe.model_dump(), ensure_ascii=False)
        if req.currentRecipe is not None
        else "null"
    )
    exclude_json = json.dumps(req.excludeSwapTexts, ensure_ascii=False)
    return REFINE_SMART_USER_TEMPLATE.format(
        instruction=req.instruction or "（无）",
        swap_instructions_json=swap_instructions_json,
        story=req.story.content,
        chapters_json=chapters_json,
        selected_tags_json=tags_json,
        recipe_json=recipe_json,
        exclude_swap_texts_json=exclude_json,
    )


def _coerce_smart_chapters(
    raw: object, expected_count: int,
) -> list[StoryChapterDTO] | None:
    if raw is None:
        return None
    if not isinstance(raw, list):
        raise AIError(
            f"smart refine chapters expected list, got {type(raw).__name__}"
        )
    if len(raw) != expected_count:
        raise AIError(
            f"smart refine chapters count mismatch: {len(raw)} != {expected_count}"
        )
    out: list[StoryChapterDTO] = []
    for i, c in enumerate(raw):
        if not isinstance(c, dict):
            raise AIError(f"smart refine chapter[{i}] not an object")
        title = str(c.get("title") or "").strip()
        summary = str(c.get("summary") or "").strip()
        if not title or not summary:
            raise AIError(f"smart refine chapter[{i}] missing title or summary")
        out.append(StoryChapterDTO(index=i + 1, title=title[:20], summary=summary))
    return out


def _coerce_smart_story(raw: object) -> StoryResult | None:
    if raw is None:
        return None
    if isinstance(raw, dict):
        content = str(raw.get("content") or "").strip()
    elif isinstance(raw, str):
        content = raw.strip()
    else:
        raise AIError(f"smart refine story unexpected type {type(raw).__name__}")
    if not content:
        raise AIError("smart refine story content empty")
    return StoryResult(content=content)


def _mock_smart_refine(req: RefineSmartRequest) -> RefineSmartResponse:
    """后端不可用时原样返回，并通过 note 告知用户。"""
    return RefineSmartResponse(
        targets=["story"],
        story=None,
        chapters=None,
        note=_OFFLINE_NOTE,
    )


async def refine_smart(
    client: httpx.AsyncClient,
    req: RefineSmartRequest,
) -> RefineSmartResponse:
    user_prompt = _smart_user_prompt(req)
    try:
        raw = await call_ai(client, REFINE_SMART_SYSTEM, user_prompt, temperature=0.75)
        try:
            data = extract_json(raw)
        except ValueError as e:
            raise AIError(f"smart refine JSON parse failed ({e})") from e
        if not isinstance(data, dict):
            raise AIError(
                f"smart refine expected object, got {type(data).__name__}"
            )

        targets_raw = data.get("targets")
        if not isinstance(targets_raw, list) or not targets_raw:
            raise AIError("smart refine missing targets")
        targets = [t for t in targets_raw if t in ("story", "chapters")]
        if not targets:
            raise AIError("smart refine targets all invalid")

        story = _coerce_smart_story(data.get("story"))
        chapters_in_count = len(req.chapters or [])
        chapters = _coerce_smart_chapters(data.get("chapters"), chapters_in_count)

        # 如果 AI 声明改了 story 但没给 story，或声明改了 chapters 但没给 chapters，
        # 视作错误降级。
        if "story" in targets and story is None:
            raise AIError("smart refine targets contains 'story' but story is null")
        if "chapters" in targets and chapters is None:
            raise AIError(
                "smart refine targets contains 'chapters' but chapters is null"
            )
        # 反过来：声明没改但又给了内容，按 targets 为准，丢弃多余的内容。
        if "story" not in targets:
            story = None
        if "chapters" not in targets:
            chapters = None

        note_raw = data.get("note")
        note = str(note_raw).strip() if isinstance(note_raw, str) else None

        # 新 recipe / swaps（顶层字段；StoryResult 内也挂一份，让前端不管从哪取都有）
        new_recipe = coerce_recipe(data.get("recipe"), allowed_fields=STORY_FIELDS)
        new_swaps = coerce_swaps(data.get("swaps"), new_recipe)
        if story is not None and (new_recipe is not None or new_swaps is not None):
            story = story.model_copy(update={
                "recipe": new_recipe,
                "swaps": new_swaps,
            })

        return RefineSmartResponse(
            targets=targets,
            story=story,
            chapters=chapters,
            note=note,
            recipe=new_recipe,
            swaps=new_swaps,
        )
    except (AIError, ValueError) as e:
        log.warning("refine_smart: AI failed (%s); falling back to mock", e)
        return _mock_smart_refine(req)


__all__ = ["refine_result", "refine_smart"]
