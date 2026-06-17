import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, Request


log = logging.getLogger(__name__)

AI_HTTP_TIMEOUT = httpx.Timeout(60.0)
# max_connections 必须 > ai_concurrency_limit，否则 semaphore 放行了 httpx 还会排队。
# 预留 headroom 给 health-check 等其它出向请求。
AI_HTTP_LIMITS = httpx.Limits(max_connections=40, max_keepalive_connections=20)

# Module-level app reference so rebuild_ai_http_client can be called from circuit breaker.
_app_ref: FastAPI | None = None


def _create_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        timeout=AI_HTTP_TIMEOUT,
        limits=AI_HTTP_LIMITS,
        trust_env=False,
    )


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Create one shared outbound AI HTTP client for the app lifetime.

    trust_env=False 强制忽略系统代理（macOS Network Settings / HTTP_PROXY 等）。
    AI 网关都是 HTTPS 直连，不需要走代理；交给系统代理判断容易踩到坏配置导致
    ConnectError。需要走代理时，显式传 proxy=... 即可。
    """
    global _app_ref
    _app_ref = app
    client = _create_client()
    app.state.ai_http_client = client
    try:
        yield
    finally:
        _app_ref = None
        await client.aclose()


async def rebuild_ai_http_client(app: FastAPI) -> None:
    """Atomically replace the shared httpx client (connection pool reset)."""
    old = getattr(app.state, "ai_http_client", None)
    new_client = _create_client()
    app.state.ai_http_client = new_client
    log.info("http_client: rebuilt shared AI client")
    if old is not None:
        # Let in-flight requests on old client finish before closing.
        async def _close_old():
            await asyncio.sleep(5.0)
            try:
                await old.aclose()
            except Exception:
                pass
        asyncio.create_task(_close_old())


def get_app_ref() -> "FastAPI | None":
    return _app_ref


def get_ai_http_client(request: Request) -> httpx.AsyncClient:
    client = getattr(request.app.state, "ai_http_client", None)
    if not isinstance(client, httpx.AsyncClient):
        raise RuntimeError("AI HTTP client is not initialized")
    return client
