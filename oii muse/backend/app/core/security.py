from fastapi import Header, HTTPException

from app.core.config import settings


async def verify_app_token(x_app_token: str = Header(...)) -> None:
    if not settings.app_token:
        return
    if x_app_token != settings.app_token:
        raise HTTPException(status_code=401, detail="Invalid app token")
