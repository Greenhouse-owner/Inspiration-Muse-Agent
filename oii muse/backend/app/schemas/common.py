from typing import Literal

from pydantic import BaseModel

CreationPath = Literal["story", "character", "worldview"]
FunnelStage = Literal["spread", "stitch", "narrow"]
TagSource = Literal["local", "ai", "user"]


class TagDTO(BaseModel):
    id: str
    text: str
    path: CreationPath
    source: TagSource = "ai"
    stage: FunnelStage | None = None
    isCrossover: bool | None = None
