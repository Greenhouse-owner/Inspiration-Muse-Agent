"""Service for /generate/{story,character,worldview}.

Each entry tries the real model first, then falls back to a deterministic
mock if the AI gateway is unreachable, the API key is missing, or the
response cannot be parsed. The mock paths mirror the frontend Fairy.tsx
demo so the UI keeps working offline.
"""

import json
import logging
import random
import re

import httpx

from app.prompts.character_result import (
    CHARACTER_SYSTEM,
    CHARACTER_USER_TEMPLATE,
)
from app.prompts.chapter_insert import (
    CHAPTER_INSERT_SYSTEM,
    CHAPTER_INSERT_USER_TEMPLATE,
)
from app.prompts.story_chapters import (
    STORY_CHAPTERS_SYSTEM,
    STORY_CHAPTERS_USER_TEMPLATE,
)
from app.prompts.story_result import STORY_SYSTEM, STORY_USER_TEMPLATE
from app.prompts.worldview_result import (
    WORLDVIEW_SYSTEM,
    WORLDVIEW_USER_TEMPLATE,
)
from app.schemas.result import (
    CharacterResult,
    GenerateCharacterResponse,
    GenerateRequest,
    GenerateStoryResponse,
    GenerateWorldviewResponse,
    InsertStoryChapterRequest,
    InsertStoryChapterResponse,
    StoryChapterDTO,
    StoryChaptersRequest,
    StoryChaptersResponse,
    StoryResult,
    WorldviewResult,
)
from app.services.ai_provider import AIError, call_ai
from app.services.json_utils import extract_json

log = logging.getLogger(__name__)


def _tags_json(req: GenerateRequest) -> str:
    """Serialize selected tags into a compact JSON array for the prompt."""
    return json.dumps(
        [{"text": t.text, "path": t.path, "source": t.source} for t in req.selectedTags],
        ensure_ascii=False,
    )


# ─── Story ────────────────────────────────────────────────────────────────────

_STORY_SCENES = {
    "废墟", "雨夜", "深海", "孤岛", "空间站", "游乐场",
    "老巷子", "地铁末班", "废弃医院", "霓虹",
}

_STORY_TEMPLATES = [
    "{world}{scene}里，{char}独自等待着什么。没有人知道他在等什么，连他自己也不确定。\n\n"
    "{event}发生之后，一切都不同了。走廊尽头那扇从未开过的门，今晚开了一条缝——"
    "透进来的不是灯光，而是别的什么。\n\n"
    "他站起来，第一次感到某种东西松动了，像是压了多年的石板终于裂开。他向那道光走去，没有回头。",

    "{scene}里，第一次相遇时，{char}和另一个人谁也没有开口。某种默契在沉默里形成。\n\n"
    "三天后，另一个人消失了，没有留下任何东西——除了地板上一个模糊的轮廓，"
    "像有人在那里站了很久，然后慢慢淡去。\n\n"
    "{world}{event}：整理遗物时，找到了一张纸条，上面用陌生笔迹写着：我一直都知道你是谁。",

    "{world}{char}手边只剩最后一样东西，是别人委托他保管的——委托的人已经不在了。\n\n"
    "{scene}，{event}已经开始。目击者都缄默不言，记录里没有这一页。"
    "只有在特定角度的光线下，墙上还隐约看得见几个字，像是被指甲刻上去的：\n\n"
    "别找我了。",
]


def _mock_story(req: GenerateRequest) -> StoryResult:
    chars = [t.text for t in req.selectedTags if t.path == "character"]
    scenes_in = [
        t.text for t in req.selectedTags
        if t.path == "story" and t.text in _STORY_SCENES
    ]
    plots = [
        t.text for t in req.selectedTags
        if t.path == "story" and t.text not in _STORY_SCENES
    ]
    worlds = [t.text for t in req.selectedTags if t.path == "worldview"]

    char = chars[0] if chars else "一个人"
    scene = scenes_in[0] if scenes_in else (plots[0] if plots else "某处")
    event = plots[0] if plots else "一件无法解释的事"
    world = f"（{worlds[0]}的世界里，）" if worlds else ""

    template = random.choice(_STORY_TEMPLATES)
    return StoryResult(
        content=template.format(world=world, scene=scene, char=char, event=event)
    )


async def generate_story(
    client: httpx.AsyncClient,
    req: GenerateRequest,
) -> GenerateStoryResponse:
    user_prompt = STORY_USER_TEMPLATE.format(selected_tags_json=_tags_json(req))
    try:
        raw = await call_ai(client, STORY_SYSTEM, user_prompt, temperature=0.85)
        content = raw.strip()
        if not content:
            raise AIError("empty story content")
        return GenerateStoryResponse(result=StoryResult(content=content))
    except AIError as e:
        log.warning("generate_story: AI failed (%s); falling back to mock", e)
        return GenerateStoryResponse(result=_mock_story(req))


# ─── Character ────────────────────────────────────────────────────────────────

_CHARACTER_FIELDS = (
    "name", "identity", "personality", "wound",
    "desire", "fear", "secret", "arc",
)


def _mock_character(req: GenerateRequest) -> CharacterResult:
    char_tags = [t.text for t in req.selectedTags if t.path == "character"]
    story_tags = [t.text for t in req.selectedTags if t.path == "story"]
    world_tags = [t.text for t in req.selectedTags if t.path == "worldview"]

    identity = char_tags[0] if char_tags else "无名之人"
    pers = char_tags[1] if len(char_tags) > 1 else "沉默"
    scene = story_tags[0] if story_tags else "某个事件"

    name = f"暂称：{scene + '里的人' if scene else identity}"
    identity_line = (
        f"一个{identity}，{f'生活在{world_tags[0]}的世界' if world_tags else '身份成谜'}。"
    )

    wound_seed = char_tags[2] if len(char_tags) > 2 else "童年阴影"
    desire_seed = story_tags[1] if len(story_tags) > 1 else "某个关键真相"
    fear_seed = char_tags[3] if len(char_tags) > 3 else "最终的秘密"

    if len(char_tags) > 4:
        secret = f"{char_tags[4]}——这件事没有人知道，甚至自己也不敢完全承认。"
    else:
        secret = "她内心的另一个声音一直在替她隐瞒什么。"

    return CharacterResult(
        name=name,
        identity=identity_line,
        personality=f"外表{pers}，内心高度警觉，很少主动开口，但观察力极强。",
        wound=f"{wound_seed}——那段记忆从未真正消失，只是被压到了底层。",
        desire=f"想找到{desire_seed}，证明自己没有疯。",
        fear=f"害怕发现{fear_seed}是自己制造的。",
        secret=secret,
        arc=f"从{pers}到主动面对；从逃避到承认；最终要在沉默与真相之间做出一个选择。",
    )


async def generate_character(
    client: httpx.AsyncClient,
    req: GenerateRequest,
) -> GenerateCharacterResponse:
    user_prompt = CHARACTER_USER_TEMPLATE.format(selected_tags_json=_tags_json(req))
    try:
        raw = await call_ai(client, CHARACTER_SYSTEM, user_prompt, temperature=0.8)
        data = extract_json(raw)
        if not isinstance(data, dict):
            raise AIError(f"character JSON is not an object: {type(data).__name__}")
        missing = [f for f in _CHARACTER_FIELDS if not data.get(f)]
        if missing:
            raise AIError(f"character JSON missing fields: {missing}")
        # Trim to known fields and coerce to schema (silently drops extras).
        return GenerateCharacterResponse(
            result=CharacterResult(**{k: data[k] for k in _CHARACTER_FIELDS})
        )
    except (AIError, ValueError) as e:
        log.warning("generate_character: AI failed (%s); falling back to mock", e)
        return GenerateCharacterResponse(result=_mock_character(req))


# ─── Worldview ────────────────────────────────────────────────────────────────

_WORLDVIEW_FIELDS = ("title", "coreRule", "cost", "taboo", "socialImpact", "conflictHooks")


def _mock_worldview(req: GenerateRequest) -> WorldviewResult:
    world_tags = [t.text for t in req.selectedTags if t.path == "worldview"]
    char_tags = [t.text for t in req.selectedTags if t.path == "character"]
    story_tags = [t.text for t in req.selectedTags if t.path == "story"]

    core = world_tags[0] if world_tags else "记忆交易"
    era = world_tags[1] if len(world_tags) > 1 else "近未来"

    cost = (
        f"{world_tags[2]}——每次使用这条规则，都必须付出这个代价。"
        if len(world_tags) > 2
        else "每次使用核心规则，都会消耗一段真实的时间记忆。"
    )

    social = (
        f"{char_tags[0]}这类人是这个世界的边缘群体，因为他们的存在违背了核心规则的假设。"
        if char_tags
        else "普通人已经接受了这套规则，认为它是自然秩序的一部分。"
    )

    hooks = [
        f"{story_tags[0]}里藏着打破规则的关键" if story_tags else "有人发现了规则的漏洞",
        "地下有一个组织专门利用规则的例外谋利",
        "政府正在推行下一个版本的规则，旧版本的痕迹将被抹除",
    ]

    return WorldviewResult(
        title=f"{era}·{core}法则",
        coreRule=(
            f"在这个世界里，{core}是社会运转的核心——不是隐喻，而是字面意义上的基础设施。"
        ),
        cost=cost,
        taboo="不能同时触发两个规则节点，否则现实层会发生折叠。",
        socialImpact=social,
        conflictHooks=hooks,
    )


async def generate_worldview(
    client: httpx.AsyncClient,
    req: GenerateRequest,
) -> GenerateWorldviewResponse:
    user_prompt = WORLDVIEW_USER_TEMPLATE.format(selected_tags_json=_tags_json(req))
    try:
        raw = await call_ai(client, WORLDVIEW_SYSTEM, user_prompt, temperature=0.8)
        data = extract_json(raw)
        if not isinstance(data, dict):
            raise AIError(f"worldview JSON is not an object: {type(data).__name__}")
        missing = [f for f in _WORLDVIEW_FIELDS if not data.get(f)]
        if missing:
            raise AIError(f"worldview JSON missing fields: {missing}")
        hooks = data.get("conflictHooks") or []
        if not isinstance(hooks, list) or not all(isinstance(h, str) for h in hooks):
            raise AIError("worldview conflictHooks must be a list of strings")
        return GenerateWorldviewResponse(
            result=WorldviewResult(
                title=data["title"],
                coreRule=data["coreRule"],
                cost=data["cost"],
                taboo=data["taboo"],
                socialImpact=data["socialImpact"],
                conflictHooks=hooks[:5],
            )
        )
    except (AIError, ValueError) as e:
        log.warning("generate_worldview: AI failed (%s); falling back to mock", e)
        return GenerateWorldviewResponse(result=_mock_worldview(req))


# ─── Story Chapters ───────────────────────────────────────────────────────────

_OFFLINE_NOTE = "（后端暂不可达，已用本地拆分生成）"


def _split_story_for_mock(story: str, n: int) -> list[str]:
    """按段落 + 句号尽量均匀切成 n 段，每段非空。"""
    paragraphs = [p.strip() for p in story.split("\n") if p.strip()]
    sentences: list[str] = []
    for p in paragraphs:
        # 按中英文句号切，保留切分符。
        parts = re.split(r"(?<=[。！？!?\.])", p)
        for s in parts:
            s = s.strip()
            if s:
                sentences.append(s)
    if not sentences:
        sentences = [story.strip() or "……"]
    # 均分
    chunks: list[str] = []
    base = max(1, len(sentences) // n)
    rem = len(sentences) % n
    cursor = 0
    for i in range(n):
        size = base + (1 if i < rem else 0)
        chunk = "".join(sentences[cursor : cursor + size]).strip()
        if not chunk:
            chunk = "……"
        chunks.append(chunk)
        cursor += size
    # 如果章数比句子多，多余的章用前文摘要兜底
    while len(chunks) < n:
        chunks.append(sentences[-1])
    return chunks[:n]


def _mock_chapter_title(text: str, idx: int) -> str:
    """从段落首句提取 2-10 个汉字作为章节名。"""
    head = re.split(r"[。！？!?\.\n]", text, maxsplit=1)[0].strip()
    if not head:
        return f"第{idx}章"
    # 截到 10 字
    return head[:10] if len(head) > 10 else head


def _mock_story_chapters(story: str, n: int) -> list[StoryChapterDTO]:
    chunks = _split_story_for_mock(story, n)
    out: list[StoryChapterDTO] = []
    for i, chunk in enumerate(chunks):
        out.append(
            StoryChapterDTO(
                index=i + 1,
                title=_mock_chapter_title(chunk, i + 1),
                summary=f"{chunk}{_OFFLINE_NOTE}",
            )
        )
    return out


def _coerce_chapters(data: object, count: int) -> list[StoryChapterDTO]:
    """从 AI 返回的 JSON 解析章节，强制重排 index、截断/校验字段。"""
    chapters_data = data.get("chapters") if isinstance(data, dict) else None
    if not isinstance(chapters_data, list):
        raise AIError("chapters JSON missing or not a list")
    out: list[StoryChapterDTO] = []
    for i, c in enumerate(chapters_data[:count]):
        if not isinstance(c, dict):
            continue
        title = str(c.get("title") or f"第{i + 1}章").strip() or f"第{i + 1}章"
        summary = str(c.get("summary") or "").strip()
        if not summary:
            continue
        out.append(StoryChapterDTO(index=i + 1, title=title, summary=summary))
    if not out:
        raise AIError("chapters JSON yielded no usable chapters")
    return out


async def generate_story_chapters(
    client: httpx.AsyncClient,
    req: StoryChaptersRequest,
) -> StoryChaptersResponse:
    user_prompt = STORY_CHAPTERS_USER_TEMPLATE.format(
        chapter_count=req.chapterCount,
        story=req.story,
    )
    try:
        raw = await call_ai(client, STORY_CHAPTERS_SYSTEM, user_prompt, temperature=0.7)
        try:
            data = extract_json(raw)
        except ValueError as e:
            raise AIError(f"chapters JSON parse failed ({e})") from e
        chapters = _coerce_chapters(data, req.chapterCount)
        # 数量不足 → 用本地 mock 补齐尾部。
        if len(chapters) < req.chapterCount:
            log.warning(
                "generate_story_chapters: AI returned %d chapters, padding to %d",
                len(chapters), req.chapterCount,
            )
            mock = _mock_story_chapters(req.story, req.chapterCount)
            for i in range(len(chapters), req.chapterCount):
                chapters.append(
                    StoryChapterDTO(
                        index=i + 1,
                        title=mock[i].title,
                        summary=mock[i].summary,
                    )
                )
        return StoryChaptersResponse(chapters=chapters[: req.chapterCount])
    except (AIError, ValueError) as e:
        log.warning(
            "generate_story_chapters: AI failed (%s); falling back to mock", e,
        )
        return StoryChaptersResponse(
            chapters=_mock_story_chapters(req.story, req.chapterCount),
        )


# ─── Insert single chapter ────────────────────────────────────────────────────


def _renumber(chapters: list[StoryChapterDTO]) -> list[StoryChapterDTO]:
    return [c.model_copy(update={"index": i + 1}) for i, c in enumerate(chapters)]


def _mock_inserted_chapter(
    story: str, chapters: list[StoryChapterDTO], insert_after: int,
) -> StoryChapterDTO:
    # 用前后章节摘要片段拼一段过渡。
    prev = chapters[insert_after - 1] if insert_after > 0 else None
    nxt = chapters[insert_after] if insert_after < len(chapters) else None
    bits: list[str] = []
    if prev:
        bits.append(f"承接「{prev.title}」结尾的状态")
    if nxt:
        bits.append(f"为「{nxt.title}」做铺垫")
    bridge = "，".join(bits) if bits else "在故事中段补充一段过渡"
    summary = f"在主线推进中，{bridge}。{_OFFLINE_NOTE}"
    return StoryChapterDTO(
        index=0,
        title="过渡章",
        summary=summary,
    )


async def insert_story_chapter(
    client: httpx.AsyncClient,
    req: InsertStoryChapterRequest,
) -> InsertStoryChapterResponse:
    if req.insertAfterIndex > len(req.chapters):
        raise ValueError(
            f"insertAfterIndex {req.insertAfterIndex} > chapter count {len(req.chapters)}"
        )
    chapters_json = json.dumps(
        [c.model_dump() for c in req.chapters], ensure_ascii=False,
    )
    hint_block = f"\nhint: {req.hint}\n" if req.hint else ""
    user_prompt = CHAPTER_INSERT_USER_TEMPLATE.format(
        story=req.story,
        chapters_json=chapters_json,
        insert_after_index=req.insertAfterIndex,
        hint_block=hint_block,
    )
    try:
        raw = await call_ai(client, CHAPTER_INSERT_SYSTEM, user_prompt, temperature=0.75)
        try:
            data = extract_json(raw)
        except ValueError as e:
            log.warning("insert_story_chapter: AI raw=%r", raw[:500])
            raise AIError(f"insert chapter JSON parse failed ({e})") from e
        if not isinstance(data, dict):
            raise AIError(
                f"insert chapter expected object, got {type(data).__name__}"
            )
        title = str(data.get("title") or "").strip()
        summary = str(data.get("summary") or "").strip()
        if not title or not summary:
            raise AIError("insert chapter missing title or summary")
        return InsertStoryChapterResponse(
            chapter=StoryChapterDTO(index=0, title=title[:20], summary=summary)
        )
    except (AIError, ValueError) as e:
        log.warning(
            "insert_story_chapter: AI failed (%s); falling back to mock", e,
        )
        return InsertStoryChapterResponse(
            chapter=_mock_inserted_chapter(
                req.story, req.chapters, req.insertAfterIndex,
            )
        )


__all__ = [
    "generate_story",
    "generate_character",
    "generate_worldview",
    "generate_story_chapters",
    "insert_story_chapter",
]
