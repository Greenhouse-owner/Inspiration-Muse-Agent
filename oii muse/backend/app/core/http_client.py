from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, Request


AI_HTTP_TIMEOUT = httpx.Timeout(60.0)
# max_connections 必须 > ai_concurrency_limit，否则 semaphore 放行了 httpx 还会排队。
# 预留 headroom 给 health-check 等其它出向请求。
AI_HTTP_LIMITS = httpx.Limits(max_connections=40, max_keepalive_connections=20)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Create one shared outbound AI HTTP client for the app lifetime.

    trust_env=False 强制忽略系统代理（macOS Network Settings / HTTP_PROXY 等）。
    AI 网关都是 HTTPS 直连，不需要走代理；交给系统代理判断容易踩到坏配置导致
    ConnectError。需要走代理时，显式传 proxy=... 即可。
    """
    async with httpx.AsyncClient(
        timeout=AI_HTTP_TIMEOUT,
        limits=AI_HTTP_LIMITS,
        trust_env=False,
    ) as client:
        app.state.ai_http_client = client
        yield


def get_ai_http_client(request: Request) -> httpx.AsyncClient:
    client = getattr(request.app.state, "ai_http_client", None)
    if not isinstance(client, httpx.AsyncClient):
        raise RuntimeError("AI HTTP client is not initialized")
    return client
