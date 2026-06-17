from pydantic import BaseModel, Field

from app.schemas.common import CreationPath, TagDTO


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


class CharacterResult(BaseModel):
    name: str
    identity: str
    personality: str
    wound: str
    desire: str
    fear: str
    secret: str
    arc: str


class WorldviewResult(BaseModel):
    title: str
    coreRule: str
    cost: str
    taboo: str
    socialImpact: str
    conflictHooks: list[str]


class GenerateStoryResponse(BaseModel):
    path: CreationPath = "story"
    result: StoryResult


class GenerateCharacterResponse(BaseModel):
    path: CreationPath = "character"
    result: CharacterResult


class GenerateWorldviewResponse(BaseModel):
    path: CreationPath = "worldview"
    result: WorldviewResult
