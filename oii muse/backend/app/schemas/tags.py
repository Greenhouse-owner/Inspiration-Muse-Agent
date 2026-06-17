from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.common import CreationPath, FunnelStage, TagDTO


class DynamicTagAnalysis(BaseModel):
    storySeed: str
    currentGoal: str
    missing: list[str] = []
    tone: str = "未定型"
    reason: str | None = None


class DynamicCloudRequest(BaseModel):
    stateKey: str
    path: CreationPath
    stage: FunnelStage
    selectedTags: list[TagDTO] = []
    excludeTexts: list[str] = []
    count: int = Field(default=18, ge=1, le=40)
    escape: bool = False
    mode: Literal["prefetch", "immediate"] = "prefetch"


class DynamicCloudResponse(BaseModel):
    stateKey: str
    path: CreationPath
    stage: FunnelStage
    analysis: DynamicTagAnalysis
    tags: list[TagDTO]
    degraded: bool = False
    degradeReason: str | None = None
