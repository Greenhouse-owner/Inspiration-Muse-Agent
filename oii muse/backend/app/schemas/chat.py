from typing import Literal

from pydantic import BaseModel

from app.schemas.common import CreationPath, TagDTO
from app.schemas.result import (
    CharacterResult,
    StoryChapterDTO,
    StoryResult,
    WorldviewResult,
)

ResultType = Literal["story", "character", "worldview"]


class CurrentResult(BaseModel):
    resultType: ResultType
    story: StoryResult | None = None
    character: CharacterResult | None = None
    worldview: WorldviewResult | None = None


class RefineRequest(BaseModel):
    path: CreationPath
    selectedTags: list[TagDTO] = []
    currentResult: CurrentResult
    userRequest: str


class RefineResponse(BaseModel):
    result: CurrentResult


SmartTarget = Literal["story", "chapters"]


class RefineSmartRequest(BaseModel):
    selectedTags: list[TagDTO] = []
    instruction: str
    story: StoryResult
    chapters: list[StoryChapterDTO] | None = None


class RefineSmartResponse(BaseModel):
    targets: list[SmartTarget]
    story: StoryResult | None = None
    chapters: list[StoryChapterDTO] | None = None
    note: str | None = None
