import httpx
from fastapi import APIRouter, Depends, Request

from app.core.http_client import get_ai_http_client
from app.core.rate_limit import check_rate_limit_cheap, check_rate_limit_expensive
from app.core.security import verify_app_token
from app.schemas.chat import (
    RefineRequest,
    RefineResponse,
    RefineSmartRequest,
    RefineSmartResponse,
    RefreshSwapsRequest,
    RefreshSwapsResponse,
)
from app.services.refine_service import refine_result, refine_smart
from app.services.swap_service import refresh_swaps

router = APIRouter(prefix="/result", dependencies=[Depends(verify_app_token)])


@router.post("/refine", response_model=RefineResponse)
async def api_refine_result(
    request: Request,
    body: RefineRequest,
    client: httpx.AsyncClient = Depends(get_ai_http_client),
):
    await check_rate_limit_expensive(request)
    return await refine_result(client, body)


@router.post("/refine-smart", response_model=RefineSmartResponse)
async def api_refine_smart(
    request: Request,
    body: RefineSmartRequest,
    client: httpx.AsyncClient = Depends(get_ai_http_client),
):
    await check_rate_limit_expensive(request)
    return await refine_smart(client, body)


@router.post("/refresh-swaps", response_model=RefreshSwapsResponse)
async def api_refresh_swaps(
    request: Request,
    body: RefreshSwapsRequest,
    client: httpx.AsyncClient = Depends(get_ai_http_client),
):
    # 走 cheap 桶（120/min），与 expensive 桶分流避免高频 🔄 挤兑生成
    await check_rate_limit_cheap(request)
    return await refresh_swaps(client, body)
