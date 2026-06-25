from pydantic import BaseModel, Field

from app.schemas.common import CreationPath, TagDTO


# ─── Recipe / Swap (调味词卡 v1) ───────────────────────────────────────────────
# 这些是可选字段，由 LLM 在生成 / refine 时一并产出。LLM 输出格式不稳定时，
# service 层用宽松解析回退到 None（旧客户端 / mock 路径都按 None 工作）。

class SwapCard(BaseModel):
    """单张调味词卡。约束：label 2-6 字，preview 10-30 字。
    上限给到 30 是给 service 层做截断的余地，防御 LLM 偶尔超字。"""
    label: str = Field(min_length=1, max_length=12)
    preview: str = Field(min_length=1, max_length=60)


class RecipeSlot(BaseModel):
    """配方栏中的一个槽位（动态字段名 + 当前简短代号）。"""
    field: str = Field(min_length=1, max_length=32)
    value: str = Field(min_length=1, max_length=32)


class Recipe(BaseModel):
    """本次结果对应的配方：恰好 3 个槽位。"""
    slots: list[RecipeSlot] = Field(min_length=3, max_length=3)


class SwapBatch(BaseModel):
    """3 个槽位 × 3 张词卡。key 与 Recipe.slots[i].field 一一对应。
    类型用 dict 是为了支持随机槽位（角色 / 世界观 路径每次抽 3 个不同字段）。"""
    cards: dict[str, list[SwapCard]]


class GenerateRequest(BaseModel):
    selectedTags: list[TagDTO]


class StoryChapterDTO(BaseModel):
    index: int
    title: str
    summary: str
    body: str | None = None
    conflictPoint: str | None = None


class StoryChaptersRequest(BaseModel):
    story: str = Field(min_length=20, max_length=4000)
    chapterCount: int = Field(ge=1, le=20)
    styleHint: str | None = None


class StoryChaptersResponse(BaseModel):
    chapters: list[StoryChapterDTO]
    degraded: bool = False
    degradeReason: str | None = None


class InsertStoryChapterRequest(BaseModel):
    story: str = Field(min_length=20, max_length=4000)
    chapters: list[StoryChapterDTO] = Field(min_length=0, max_length=20)
    insertAfterIndex: int = Field(ge=0, le=20)
    hint: str | None = None


class InsertStoryChapterResponse(BaseModel):
    chapter: StoryChapterDTO
    degraded: bool = False
    degradeReason: str | None = None


class StoryResult(BaseModel):
    content: str
    recipe: Recipe | None = None
    swaps: SwapBatch | None = None


class CharacterResult(BaseModel):
    name: str
    identity: str
    personality: str
    wound: str
    desire: str
    fear: str
    secret: str
    arc: str
    recipe: Recipe | None = None
    swaps: SwapBatch | None = None


class WorldviewResult(BaseModel):
    title: str
    coreRule: str
    cost: str
    taboo: str
    socialImpact: str
    conflictHooks: list[str]
    recipe: Recipe | None = None
    swaps: SwapBatch | None = None


class GenerateStoryResponse(BaseModel):
    path: CreationPath = "story"
    result: StoryResult


class GenerateCharacterResponse(BaseModel):
    path: CreationPath = "character"
    result: CharacterResult


class GenerateWorldviewResponse(BaseModel):
    path: CreationPath = "worldview"
    result: WorldviewResult
