from fastapi import APIRouter

router = APIRouter()


# UptimeRobot 免费版默认用 HEAD 探测；同时挂 GET + HEAD 让它能正常通。
@router.api_route("/health", methods=["GET", "HEAD"])
async def health_check():
    return {
        "ok": True,
        "service": "oiioii-muse-api",
        "version": "0.2.0",
    }
