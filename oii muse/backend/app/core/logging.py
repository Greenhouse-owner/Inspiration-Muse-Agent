"""结构化请求日志 + 简单 logging 配置。

为什么不上 structlog / loguru：明天上线，依赖越少越稳。stdlib logging
+ 一个 middleware 已经够 Railway 控制台肉眼读 + 用 grep / jq 排错。

输出一行 JSON：method / path / status / dur_ms / client / err（如果有）。
不记录 request body（可能含用户文本，避免误存）。
"""

import json
import logging
import sys
import time
import uuid

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response


def configure_logging() -> None:
    """统一 logging 配置：INFO 级别 + stdout JSON 行。

    uvicorn / fastapi / httpx 默认 logger 全部继承 root，都按这套格式输出。
    """
    root = logging.getLogger()
    # 防止 uvicorn --reload 重启时 handler 累计
    for h in list(root.handlers):
        root.removeHandler(h)
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(_JsonFormatter())
    root.addHandler(handler)
    root.setLevel(logging.INFO)
    # uvicorn 的 access log 已经被我们的中间件取代，关掉避免重复
    logging.getLogger("uvicorn.access").disabled = True


class _JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts": int(record.created * 1000),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


_log = logging.getLogger("muse.req")


class RequestLogMiddleware(BaseHTTPMiddleware):
    """每个 HTTP 请求结束时打一行结构化日志。

    health 端点跳过（Railway 每秒打一次，会刷屏）。
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        if request.url.path == "/health":
            return await call_next(request)

        rid = uuid.uuid4().hex[:8]
        start = time.perf_counter()
        client_id = request.headers.get("x-client-id", "")[:32]
        ip = request.client.host if request.client else ""

        try:
            response = await call_next(request)
        except Exception as exc:
            dur_ms = int((time.perf_counter() - start) * 1000)
            _log.exception(
                json.dumps({
                    "rid": rid, "method": request.method, "path": request.url.path,
                    "status": 500, "dur_ms": dur_ms,
                    "cid": client_id, "ip": ip,
                    "err": f"{type(exc).__name__}: {exc}",
                }, ensure_ascii=False)
            )
            raise

        dur_ms = int((time.perf_counter() - start) * 1000)
        _log.info(
            json.dumps({
                "rid": rid, "method": request.method, "path": request.url.path,
                "status": response.status_code, "dur_ms": dur_ms,
                "cid": client_id, "ip": ip,
            }, ensure_ascii=False)
        )
        return response
