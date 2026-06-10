from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
async def health_check():
    return {
        "ok": True,
        "service": "oiioii-muse-api",
        "version": "0.2.0",
    }
