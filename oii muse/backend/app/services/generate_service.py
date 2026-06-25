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
    Recipe,
    RecipeSlot,
    StoryChapterDTO,
    StoryChaptersRequest,
    StoryChaptersResponse,
    StoryResult,
    SwapBatch,
    SwapCard,
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
        content=template.format(world=world, scene=scene, char=char, event=event),
        recipe=Recipe(slots=[
            RecipeSlot(field="character", value=(char or "主角")[:32]),
            RecipeSlot(field="conflict",  value=(event or "冲突")[:32]),
            RecipeSlot(field="worldview", value=(worlds[0] if worlds else (scene or "未知世界"))[:32]),
        ]),
        swaps=_MOCK_STORY_SWAPS,
    )


# 离线模式下的固定调味词卡。这里 9 张挑通用的、跨题材都能用的，
# 不依赖具体已选词，让用户在 AI 不可达时仍能体验调味交互。
_MOCK_STORY_SWAPS = SwapBatch(cards={
    "character": [
        SwapCard(label="冒牌公主", preview="继位典礼前发现王室族谱被人篡改"),
        SwapCard(label="失忆刺客", preview="醒来发现这次的任务目标是自己"),
        SwapCard(label="怪物医生", preview="专给非人之物看病的孤独医师"),
    ],
    "conflict": [
        SwapCard(label="时间倒流", preview="每死一次就会回到当天清晨"),
        SwapCard(label="被全城追捕", preview="所有人都坚信主角是凶手"),
        SwapCard(label="未来来信", preview="收到自己未来寄来的最后一封信"),
    ],
    "worldview": [
        SwapCard(label="时间图书馆", preview="每本书都预先写出读者的死亡日期"),
        SwapCard(label="亡灵邮局", preview="只能向已经死去的人寄出书信"),
        SwapCard(label="谎言之城", preview="只有谎言才能在这座城里成真"),
    ],
})


async def generate_story(
    client: httpx.AsyncClient,
    req: GenerateRequest,
) -> GenerateStoryResponse:
    user_prompt = STORY_USER_TEMPLATE.format(selected_tags_json=_tags_json(req))
    try:
        raw = await call_ai(client, STORY_SYSTEM, user_prompt, temperature=0.85)
        # JSON 输出：含 content + recipe + swaps。
        # 解析失败时退回到把 raw 当纯文本用，保证至少能看故事。
        content = ""
        recipe = None
        swaps = None
        try:
            data = extract_json(raw)
            if isinstance(data, dict):
                content = str(data.get("content") or "").strip()
                recipe = coerce_recipe(data.get("recipe"), allowed_fields=STORY_FIELDS)
                swaps = coerce_swaps(data.get("swaps"), recipe)
        except ValueError:
            pass

        if not content:
            # 旧风格 / 解析失败 → 整段当 content 用
            content = raw.strip()
        if not content:
            raise AIError("empty story content")

        return GenerateStoryResponse(
            result=StoryResult(content=content, recipe=recipe, swaps=swaps)
        )
    except AIError as e:
        log.warning("generate_story: AI failed (%s); falling back to mock", e)
        return GenerateStoryResponse(result=_mock_story(req))


# ─── Character ────────────────────────────────────────────────────────────────

_CHARACTER_FIELDS = (
    "name", "identity", "personality", "wound",
    "desire", "fear", "secret", "arc",
)

# 每个调味槽位的 mock 词卡。LLM 在线时这些走 LLM 输出，离线 / 解析失败才用这套。
_MOCK_CHARACTER_SWAP_POOL: dict[str, list[SwapCard]] = {
    "identity": [
        SwapCard(label="冒牌公主", preview="继位典礼前发现王室族谱被人篡改"),
        SwapCard(label="退休杀手", preview="为保护邻家女孩重新拿起武器"),
        SwapCard(label="怪物医生", preview="专给非人之物看病的孤独医师"),
    ],
    "personality": [
        SwapCard(label="冷峻克制", preview="情绪从不外露，但每个决定都精确得吓人"),
        SwapCard(label="玩世不恭", preview="用笑声掩饰所有真心，关键时刻最先动手"),
        SwapCard(label="偏执敏感", preview="一句话能琢磨三天，别人都觉得 ta 想多了"),
    ],
    "wound": [
        SwapCard(label="目睹至亲死去", preview="那场死亡的画面成为 ta 余生的滤镜"),
        SwapCard(label="被亲人背叛", preview="最信任的人亲手交出了自己"),
        SwapCard(label="自己制造的灾难", preview="那场祸事的源头是 ta 不愿承认的一念"),
    ],
    "desire": [
        SwapCard(label="向死神复仇", preview="把每一个欠下的命都用相同方式收回"),
        SwapCard(label="找回失踪的爱人", preview="哪怕证据都说那个人从未存在过"),
        SwapCard(label="毁掉自己的杰作", preview="只有亲手销毁才能真正自由"),
    ],
    "fear": [
        SwapCard(label="再次失败", preview="比死更怕的是又一次什么都没救成"),
        SwapCard(label="被发现真相", preview="一旦被识破，所有关系会一夜崩塌"),
        SwapCard(label="变成最讨厌的人", preview="那个曾经发誓不会成为的样子正在靠近"),
    ],
    "secret": [
        SwapCard(label="杀过人", preview="那一夜的尸体从未被发现，但 ta 记得"),
        SwapCard(label="非人血统", preview="某些月夜身体会出现解释不了的变化"),
        SwapCard(label="日记全是谎话", preview="写下来的每一句都是写给将来读它的人看的"),
    ],
    "arc": [
        SwapCard(label="从冷漠到牺牲", preview="从只顾自己到为陌生人挡下最后一刀"),
        SwapCard(label="从善良到黑化", preview="善良在这个世界里被反复利用直到再也举不起"),
        SwapCard(label="困在原地", preview="想成为另一个人却最终活回了原来的样子"),
    ],
}


def _fixed_mock_recipe_slots(fields: tuple[str, ...], values: dict[str, str]) -> Recipe:
    """mock 路径下，按钦定的 3 个 field 顺序生成 recipe（不随机）。"""
    return Recipe(slots=[
        RecipeSlot(field=f, value=values.get(f, f)[:32]) for f in fields
    ])


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

    # 钦定 3 槽：identity / wound / desire
    field_values = {
        "identity": identity[:8] or "无名之人",
        "wound":    wound_seed[:8] or "童年阴影",
        "desire":   desire_seed[:8] or "找寻真相",
    }
    recipe = _fixed_mock_recipe_slots(
        ("identity", "wound", "desire"),
        field_values,
    )
    swaps = SwapBatch(cards={
        slot.field: list(_MOCK_CHARACTER_SWAP_POOL[slot.field])
        for slot in recipe.slots
    })

    return CharacterResult(
        name=name,
        identity=identity_line,
        personality=f"外表{pers}，内心高度警觉，很少主动开口，但观察力极强。",
        wound=f"{wound_seed}——那段记忆从未真正消失，只是被压到了底层。",
        desire=f"想找到{desire_seed}，证明自己没有疯。",
        fear=f"害怕发现{fear_seed}是自己制造的。",
        secret=secret,
        arc=f"从{pers}到主动面对；从逃避到承认；最终要在沉默与真相之间做出一个选择。",
        recipe=recipe,
        swaps=swaps,
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
        recipe = coerce_recipe(data.get("recipe"), allowed_fields=CHARACTER_FIELDS)
        swaps = coerce_swaps(data.get("swaps"), recipe)
        return GenerateCharacterResponse(
            result=CharacterResult(
                **{k: data[k] for k in _CHARACTER_FIELDS},
                recipe=recipe,
                swaps=swaps,
            )
        )
    except (AIError, ValueError) as e:
        log.warning("generate_character: AI failed (%s); falling back to mock", e)
        return GenerateCharacterResponse(result=_mock_character(req))


# ─── Worldview ────────────────────────────────────────────────────────────────

_WORLDVIEW_FIELDS = ("title", "coreRule", "cost", "taboo", "socialImpact", "conflictHooks")

_MOCK_WORLDVIEW_SWAP_POOL: dict[str, list[SwapCard]] = {
    "coreRule": [
        SwapCard(label="预知死期", preview="书会预先写出读者的死亡日期"),
        SwapCard(label="谎言成真", preview="只有谎言才能在这座城里成真"),
        SwapCard(label="影子分裂", preview="每个人的影子拥有独立意志"),
    ],
    "cost": [
        SwapCard(label="折寿", preview="每次施展规则都要付出一段真实寿命"),
        SwapCard(label="忘故人", preview="代价是从此忘记一个最在乎的人"),
        SwapCard(label="替身偿还", preview="必须有另一个人替你承担这次后果"),
    ],
    "taboo": [
        SwapCard(label="不可直名", preview="不能在月光下直呼真名否则被替换"),
        SwapCard(label="不可照镜", preview="日落后照镜子会被另一面拉走"),
        SwapCard(label="不可记梦", preview="梦境一旦写下来就会照进现实"),
    ],
    "socialImpact": [
        SwapCard(label="贫者无声", preview="买不起规则的人逐渐从社会里消失"),
        SwapCard(label="阶层倒挂", preview="掌握规则的人反而是最被监视的群体"),
        SwapCard(label="规则崇拜", preview="人们把规则当成新宗教供奉"),
    ],
    "conflictHooks": [
        SwapCard(label="规则反噬", preview="新一代发现规则正在吞噬制定者"),
        SwapCard(label="地下版本", preview="黑市流通着被官方禁用的旧规则"),
        SwapCard(label="替换计划", preview="某个组织正在悄悄改写核心规则的语义"),
    ],
}


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

    # 钦定 3 槽：coreRule / taboo / conflictHooks
    field_values = {
        "coreRule":      core[:8] or "记忆交易",
        "taboo":         "不可触双规",
        "conflictHooks": (story_tags[0] if story_tags else "规则漏洞")[:8],
    }
    recipe = _fixed_mock_recipe_slots(
        ("coreRule", "taboo", "conflictHooks"),
        field_values,
    )
    swaps = SwapBatch(cards={
        slot.field: list(_MOCK_WORLDVIEW_SWAP_POOL[slot.field])
        for slot in recipe.slots
    })

    return WorldviewResult(
        title=f"{era}·{core}法则",
        coreRule=(
            f"在这个世界里，{core}是社会运转的核心——不是隐喻，而是字面意义上的基础设施。"
        ),
        cost=cost,
        taboo="不能同时触发两个规则节点，否则现实层会发生折叠。",
        socialImpact=social,
        conflictHooks=hooks,
        recipe=recipe,
        swaps=swaps,
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
        recipe = coerce_recipe(data.get("recipe"), allowed_fields=WORLDVIEW_FIELDS)
        swaps = coerce_swaps(data.get("swaps"), recipe)
        return GenerateWorldviewResponse(
            result=WorldviewResult(
                title=data["title"],
                coreRule=data["coreRule"],
                cost=data["cost"],
                taboo=data["taboo"],
                socialImpact=data["socialImpact"],
                conflictHooks=hooks[:5],
                recipe=recipe,
                swaps=swaps,
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
    """Mock 模式不再用故事原文截断——容易出现"最后的对峙在一间无人"这种半句。
    直接返回"第 N 章"，配合 degraded 标记让用户知道这是降级输出。"""
    return f"第{idx}章"


def _mock_story_chapters(story: str, n: int) -> list[StoryChapterDTO]:
    chunks = _split_story_for_mock(story, n)
    out: list[StoryChapterDTO] = []
    for i, chunk in enumerate(chunks):
        out.append(
            StoryChapterDTO(
                index=i + 1,
                title=_mock_chapter_title(chunk, i + 1),
                # 不再把 _OFFLINE_NOTE 贴在 summary 末尾——那是噪音。
                # 降级状态由 response 的 degraded 字段表达，前端统一在章节卡顶部显示一行提示。
                summary=chunk,
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
    # 自动重试 1 次：itlsj 网关偶发 502/timeout，第二次往往就过了。
    # 重试只对真·瞬时错误有意义，所以仅捕获 AIError，不捕获 ValueError(JSON 错乱属于"AI 输出问题"，重试也大概率还是错)。
    last_err: Exception | None = None
    raw: str | None = None
    for attempt in range(2):
        try:
            raw = await call_ai(client, STORY_CHAPTERS_SYSTEM, user_prompt, temperature=0.7)
            break
        except AIError as e:
            last_err = e
            if attempt == 0:
                log.warning("generate_story_chapters: AI attempt 1 failed (%s), retrying once", e)

    if raw is None:
        log.warning(
            "generate_story_chapters: AI failed after retry (%s); falling back to mock", last_err,
        )
        return StoryChaptersResponse(
            chapters=_mock_story_chapters(req.story, req.chapterCount),
            degraded=True,
            degradeReason="ai_unavailable",
        )

    try:
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
            "generate_story_chapters: AI parse failed (%s); falling back to mock", e,
        )
        return StoryChaptersResponse(
            chapters=_mock_story_chapters(req.story, req.chapterCount),
            degraded=True,
            degradeReason="ai_unavailable",
        )


# ─── Insert single chapter ────────────────────────────────────────────────────


def _renumber(chapters: list[StoryChapterDTO]) -> list[StoryChapterDTO]:
    return [c.model_copy(update={"index": i + 1}) for i, c in enumerate(chapters)]


def _mock_inserted_chapter(
    story: str, chapters: list[StoryChapterDTO], insert_after: int,
) -> StoryChapterDTO:
    # 用前后章节摘要片段拼一段过渡。降级提示由 response.degraded 表达，不再贴在 summary 末尾。
    prev = chapters[insert_after - 1] if insert_after > 0 else None
    nxt = chapters[insert_after] if insert_after < len(chapters) else None
    bits: list[str] = []
    if prev:
        bits.append(f"承接「{prev.title}」结尾的状态")
    if nxt:
        bits.append(f"为「{nxt.title}」做铺垫")
    bridge = "，".join(bits) if bits else "在故事中段补充一段过渡"
    summary = f"在主线推进中，{bridge}。"
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
    # 自动重试 1 次，处理 itlsj 偶发 502
    last_err: Exception | None = None
    raw: str | None = None
    for attempt in range(2):
        try:
            raw = await call_ai(client, CHAPTER_INSERT_SYSTEM, user_prompt, temperature=0.75)
            break
        except AIError as e:
            last_err = e
            if attempt == 0:
                log.warning("insert_story_chapter: AI attempt 1 failed (%s), retrying once", e)

    if raw is None:
        log.warning(
            "insert_story_chapter: AI failed after retry (%s); falling back to mock", last_err,
        )
        return InsertStoryChapterResponse(
            chapter=_mock_inserted_chapter(
                req.story, req.chapters, req.insertAfterIndex,
            ),
            degraded=True,
            degradeReason="ai_unavailable",
        )

    try:
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
            "insert_story_chapter: AI parse failed (%s); falling back to mock", e,
        )
        return InsertStoryChapterResponse(
            chapter=_mock_inserted_chapter(
                req.story, req.chapters, req.insertAfterIndex,
            ),
            degraded=True,
            degradeReason="ai_unavailable",
        )


__all__ = [
    "generate_story",
    "generate_character",
    "generate_worldview",
    "generate_story_chapters",
    "insert_story_chapter",
]
