from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.common import CreationPath, TagDTO
from app.schemas.result import (
    CharacterResult,
    Recipe,
    StoryChapterDTO,
    StoryResult,
    SwapBatch,
    WorldviewResult,
)

ResultType = Literal["story", "character", "worldview"]


class CurrentResult(BaseModel):
    resultType: ResultType
    story: StoryResult | None = None
    character: CharacterResult | None = None
    worldview: WorldviewResult | None = None


# ─── Swap（调味词卡 v1） ───────────────────────────────────────────────────────

class SwapInstruction(BaseModel):
    """用户从调味词卡里选了一张要替换。"""
    field: str = Field(min_length=1, max_length=32)
    label: str = Field(min_length=1, max_length=12)


class RefineRequest(BaseModel):
    path: CreationPath
    selectedTags: list[TagDTO] = []
    currentResult: CurrentResult
    userRequest: str = ""


class RefineResponse(BaseModel):
    result: CurrentResult


SmartTarget = Literal["story", "chapters"]


class RefineSmartRequest(BaseModel):
    selectedTags: list[TagDTO] = []
    instruction: str = ""
    story: StoryResult
    chapters: list[StoryChapterDTO] | None = None
    # 新增：调味词卡相关。全部可选，旧客户端不传时与原行为一致。
    path: CreationPath = "story"
    currentRecipe: Recipe | None = None
    swapInstructions: list[SwapInstruction] = []
    excludeSwapTexts: list[str] = []


class RefineSmartResponse(BaseModel):
    targets: list[SmartTarget]
    story: StoryResult | None = None
    chapters: list[StoryChapterDTO] | None = None
    note: str | None = None
    # 新增：新一轮的配方和词卡。LLM 解析失败或调用方没启用 swap 时为 None。
    recipe: Recipe | None = None
    swaps: SwapBatch | None = None


class RefreshSwapsRequest(BaseModel):
    """仅刷新调味词卡（保留当前结果与配方）。走 cheap 限流桶。"""
    path: CreationPath
    outline: str = Field(min_length=1, max_length=4000)
    recipe: Recipe
    excludeSwapTexts: list[str] = []


class RefreshSwapsResponse(BaseModel):
    swaps: SwapBatch | None = None
    degraded: bool = False
    degradeReason: str | None = None

