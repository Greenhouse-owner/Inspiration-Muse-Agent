"""Process-global circuit breaker for AI gateway calls.

Tracks consecutive failures across all requests. When failures exceed the
threshold the breaker opens, blocking further calls (they immediately raise
AIError). After a cooldown the breaker enters half-open state and allows one
probe. On success it closes; on failure it re-opens.

If the breaker has cycled through OPEN→HALF_OPEN→OPEN multiple times without
recovery, it triggers an httpx client rebuild (fixes connection pool poisoning).
"""

import asyncio
import logging
import time
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from fastapi import FastAPI

log = logging.getLogger(__name__)

FAILURE_THRESHOLD = 5
RECOVERY_INTERVAL = 30.0  # seconds before half-open probe
REBUILD_AFTER_CYCLES = 3  # open cycles without recovery → rebuild client


class _CircuitBreaker:
    def __init__(self) -> None:
        self._consecutive_failures = 0
        self._state: str = "closed"  # closed | open | half_open
        self._last_failure_time: float = 0.0
        self._open_cycles = 0
        self._lock = asyncio.Lock()

    @property
    def is_degraded(self) -> bool:
        return self._state != "closed"

    @property
    def degrade_reason(self) -> str | None:
        if self._state == "closed":
            return None
        return "ai_gateway_unavailable"

    def should_allow(self) -> bool:
        if self._state == "closed":
            return True
        if self._state == "open":
            elapsed = time.time() - self._last_failure_time
            if elapsed >= RECOVERY_INTERVAL:
                self._state = "half_open"
                log.info("circuit_breaker: open → half_open (probing)")
                return True
            return False
        # half_open: allow one probe
        return True

    def record_success(self) -> None:
        if self._state != "closed":
            log.info("circuit_breaker: %s → closed (AI recovered)", self._state)
        self._consecutive_failures = 0
        self._state = "closed"
        self._open_cycles = 0

    async def record_failure(self, app: "FastAPI | None" = None) -> None:
        self._consecutive_failures += 1
        self._last_failure_time = time.time()

        if self._state == "half_open":
            self._state = "open"
            self._open_cycles += 1
            log.warning(
                "circuit_breaker: half_open → open (probe failed, cycle %d)",
                self._open_cycles,
            )
        elif self._consecutive_failures >= FAILURE_THRESHOLD and self._state == "closed":
            self._state = "open"
            self._open_cycles += 1
            log.warning(
                "circuit_breaker: closed → open (%d consecutive failures)",
                self._consecutive_failures,
            )

        if self._open_cycles >= REBUILD_AFTER_CYCLES and app is not None:
            async with self._lock:
                if self._open_cycles >= REBUILD_AFTER_CYCLES:
                    log.warning(
                        "circuit_breaker: %d open cycles — rebuilding httpx client",
                        self._open_cycles,
                    )
                    from app.core.http_client import rebuild_ai_http_client
                    await rebuild_ai_http_client(app)
                    self._open_cycles = 0


circuit_breaker = _CircuitBreaker()
