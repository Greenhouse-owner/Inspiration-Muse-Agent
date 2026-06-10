import httpx
from fastapi import APIRouter, Depends, Request

from app.core.http_client import get_ai_http_client
from app.core.rate_limit import check_rate_limit_cheap
from app.core.security import verify_app_token
from app.schemas.tags import (
    DynamicCloudRequest,
    DynamicCloudResponse,
)
from app.services.tag_service import dynamic_cloud

router = APIRouter(prefix="/tags", dependencies=[Depends(verify_app_token)])


@router.post("/dynamic-cloud", response_model=DynamicCloudResponse)
async def api_dynamic_cloud(
    request: Request,
    body: DynamicCloudRequest,
    client: httpx.AsyncClient = Depends(get_ai_http_client),
):
    await check_rate_limit_cheap(request)
    return await dynamic_cloud(client, body)
