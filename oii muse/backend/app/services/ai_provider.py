import asyncio
import logging
import re
from dataclasses import dataclass

import httpx

from app.core.circuit_breaker import circuit_breaker
from app.core.config import settings
from app.core.http_client import get_app_ref


log = logging.getLogger(__name__)


class AIError(Exception):
    """Raised when the AI gateway is unreachable or returns a non-2xx."""


# 后端到 AI 网关的并发上限。超过的请求在 acquire 处排队，不挤兑下游。
# 注意：semaphore 包在 fallback 链外层，整个 primary→fallback 序列共占 1 个 slot，
# 避免 primary 卡住时 fallback 再要 slot 导致死锁。
_ai_semaphore: asyncio.Semaphore | None = None


def _get_ai_semaphore() -> asyncio.Semaphore:
    """懒初始化 —— 必须在 event loop 跑起来后再创建。"""
    global _ai_semaphore
    if _ai_semaphore is None:
        _ai_semaphore = asyncio.Semaphore(settings.ai_concurrency_limit)
    return _ai_semaphore


@dataclass(frozen=True)
class _AIEndpoint:
    name: str
    base_url: str
    api_key: str
    model: str


# Strip leading thinking traces emitted by reasoning-style models
# (e.g. claude-sonnet-4-6-thinking via OpenAI-compatible gateways).
# We remove any <thinking>…</thinking> blocks anywhere in the text.
_THINKING_RE = re.compile(r"<thinking>.*?</thinking>", flags=re.DOTALL | re.IGNORECASE)


def _strip_thinking(text: str) -> str:
    cleaned = _THINKING_RE.sub("", text)
    return cleaned.strip()


async def _call_endpoint(
    client: httpx.AsyncClient,
    endpoint: _AIEndpoint,
    system_prompt: str,
    user_prompt: str,
    *,
    temperature: float,
    timeout: float,
) -> str:
    if not endpoint.api_key:
        raise AIError(f"{endpoint.name} AI API key not configured")

    headers = {
        "Authorization": f"Bearer {endpoint.api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": endpoint.model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": temperature,
    }

    base_url = endpoint.base_url.rstrip("/")
    try:
        response = await client.post(
            f"{base_url}/chat/completions",
            headers=headers,
            json=payload,
            timeout=timeout,
        )
        response.raise_for_status()
    except httpx.HTTPStatusError as e:
        raise AIError(f"{endpoint.name} AI gateway {e.response.status_code}") from e
    except httpx.RequestError as e:
        raise AIError(f"{endpoint.name} AI gateway connection error: {e}") from e

    data = response.json()
    try:
        content = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as e:
        raise AIError(f"Malformed {endpoint.name} AI response") from e
    if not isinstance(content, str) or not content.strip():
        raise AIError(f"Empty {endpoint.name} AI response")
    return _strip_thinking(content)


async def _call_with_fallback(
    client: httpx.AsyncClient,
    primary: _AIEndpoint,
    fallback: _AIEndpoint,
    system_prompt: str,
    user_prompt: str,
    *,
    temperature: float,
    timeout: float,
) -> str:
    # Circuit breaker：开路时直接 raise，让上游走 mock，省掉打死网关的请求
    if not circuit_breaker.should_allow():
        raise AIError("circuit_open: AI gateway recently failed, skipping call")

    async with _get_ai_semaphore():
        try:
            result = await _call_endpoint(
                client,
                primary,
                system_prompt,
                user_prompt,
                temperature=temperature,
                timeout=timeout,
            )
            circuit_breaker.record_success()
            return result
        except AIError as primary_error:
            if not fallback.api_key:
                await circuit_breaker.record_failure(get_app_ref())
                raise
            log.warning("%s AI failed; switching to fallback gateway: %s", primary.name, primary_error)
            try:
                result = await _call_endpoint(
                    client,
                    fallback,
                    system_prompt,
                    user_prompt,
                    temperature=temperature,
                    timeout=timeout,
                )
                circuit_breaker.record_success()
                return result
            except AIError as fallback_error:
                await circuit_breaker.record_failure(get_app_ref())
                raise AIError(
                    f"{primary.name} and fallback AI gateways failed: "
                    f"{primary_error}; {fallback_error}"
                ) from fallback_error


async def call_ai(
    client: httpx.AsyncClient,
    system_prompt: str,
    user_prompt: str,
    *,
    temperature: float = 0.8,
    timeout: float = 60.0,
) -> str:
    """Call the primary AI gateway, then fallback gateway if configured."""
    primary = _AIEndpoint(
        name="primary",
        base_url=settings.ai_api_base_url,
        api_key=settings.ai_api_key,
        model=settings.ai_model,
    )
    fallback = _AIEndpoint(
        name="fallback",
        base_url=settings.fallback_ai_api_base_url,
        api_key=settings.fallback_ai_api_key,
        model=settings.fallback_ai_model,
    )
    return await _call_with_fallback(
        client,
        primary,
        fallback,
        system_prompt,
        user_prompt,
        temperature=temperature,
        timeout=timeout,
    )


async def call_tag_ai(
    client: httpx.AsyncClient,
    system_prompt: str,
    user_prompt: str,
    *,
    temperature: float = 0.8,
    timeout: float = 15.0,
) -> str:
    """Call the fast dynamic-tag model without changing normal generation."""
    primary = _AIEndpoint(
        name="tag",
        base_url=settings.tag_ai_api_base_url or settings.ai_api_base_url,
        api_key=settings.tag_ai_api_key or settings.ai_api_key,
        model=settings.tag_ai_model,
    )
    fallback = _AIEndpoint(
        name="fallback",
        base_url=settings.fallback_ai_api_base_url,
        api_key=settings.fallback_ai_api_key,
        model=settings.fallback_ai_model,
    )
    return await _call_with_fallback(
        client,
        primary,
        fallback,
        system_prompt,
        user_prompt,
        temperature=temperature,
        timeout=timeout,
    )
