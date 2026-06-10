"""分桶限流（per-client + 全局熔断）。

为什么不简单按 IP？
  - 100 个内部用户共享同一个 X-App-Token（按 token 分桶等于全局桶）
  - 公司 / 学校 / 家用 NAT 同一出口 IP（按 IP 分桶会让同事互相挤兑）

方案：前端在 localStorage 维护一个 UUID，作为 X-Client-Id 发回来。
内部用户场景下作弊动机低，清 localStorage 会重置额度但可接受。
没带 X-Client-Id 的请求兜底用 IP 做桶（保护性，不算正常路径）。

两档限额：
  - expensive: generate / refine（每次都调 AI 大模型，成本高）
  - cheap:     tags 词云（mini 模型，量大但便宜）

外加一个全局每分钟熔断，防止任何单一异常打爆 AI 网关。
"""

import time
from collections import defaultdict
from threading import Lock

from fastapi import HTTPException, Request

from app.core.config import settings

# {bucket_key: [timestamp, ...]}
_expensive_log: dict[str, list[float]] = defaultdict(list)
_cheap_log: dict[str, list[float]] = defaultdict(list)
# 全局每分钟熔断
_global_minute_log: list[float] = []
_lock = Lock()


def _bucket_key(request: Request) -> str:
    """优先 client_id，其次 ip。两者都拿不到才 unknown。"""
    client_id = request.headers.get("x-client-id", "").strip()
    if client_id:
        return f"cid:{client_id[:64]}"  # 防人为超长
    if request.client and request.client.host:
        return f"ip:{request.client.host}"
    return "unknown"


def _prune(log: list[float], now: float, window: float) -> list[float]:
    return [t for t in log if now - t < window]


def _check(
    bucket: dict[str, list[float]],
    key: str,
    per_minute: int,
    per_day: int,
    label: str,
) -> None:
    now = time.time()
    with _lock:
        # 全局熝断（1 分钟任何 endpoint 累计，防 AI 网关打爆）
        global _global_minute_log
        _global_minute_log = _prune(_global_minute_log, now, 60.0)
        if len(_global_minute_log) >= settings.rate_limit_global_per_minute:
            raise HTTPException(
                status_code=503,
                detail="Server is busy, please try again in a moment.",
            )

        log = _prune(bucket[key], now, 86400.0)
        bucket[key] = log

        recent_minute = [t for t in log if now - t < 60.0]
        if len(recent_minute) >= per_minute:
            raise HTTPException(
                status_code=429,
                detail=f"Rate limit exceeded ({label}, per minute)",
            )
        if len(log) >= per_day:
            raise HTTPException(
                status_code=429,
                detail=f"Rate limit exceeded ({label}, per day)",
            )

        log.append(now)
        _global_minute_log.append(now)


async def check_rate_limit_expensive(request: Request) -> None:
    """generate / refine 类 endpoint。成本高，额度严。"""
    _check(
        _expensive_log,
        _bucket_key(request),
        settings.rate_limit_expensive_per_minute,
        settings.rate_limit_expensive_per_day,
        "expensive",
    )


async def check_rate_limit_cheap(request: Request) -> None:
    """tags / dynamic-cloud 类 endpoint。量大但成本低，额度宽。"""
    _check(
        _cheap_log,
        _bucket_key(request),
        settings.rate_limit_cheap_per_minute,
        settings.rate_limit_cheap_per_day,
        "cheap",
    )
