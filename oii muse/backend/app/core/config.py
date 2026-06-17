from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    ai_api_base_url: str = "https://api.example.com"
    ai_api_key: str = ""
    ai_model: str = "claude-opus-4-8"

    # Fast model dedicated to dynamic tag generation. Does not affect normal generation.
    tag_ai_api_base_url: str = ""
    tag_ai_api_key: str = ""
    tag_ai_model: str = "gpt-4o-mini-2024-07-18"

    # Optional fallback AI gateway. Used only when the primary gateway fails.
    fallback_ai_api_base_url: str = "https://lnapi.com/v1"
    fallback_ai_api_key: str = ""
    fallback_ai_model: str = "gpt-5.1-codex-mini"

    app_token: str = ""

    # ── Rate limit ─────────────────────────────────────────────────────────
    # 内部 100 人内测：限额只作为"极限拦截"——挡 token 泄漏后的恶意脚本，
    # 友好用户完全感知不到。expensive 1000/人/天 = 一个人手动玩 1 小时也用不完。
    # 全局熔断 1200/分钟 在被批量攻击时触发；100 人正常使用峰值约 350/min。
    rate_limit_expensive_per_minute: int = 30
    rate_limit_expensive_per_day: int = 1000
    rate_limit_cheap_per_minute: int = 120
    rate_limit_cheap_per_day: int = 10000
    rate_limit_global_per_minute: int = 1200

    # 后端到 AI 网关的并发上限（同时进行的 AI 调用数）。超过的请求排队。
    # 注意：这不是限速，是保护下游网关不被 100 人同时挤兑全 503。
    # 20 路在 100 人场景下：最坏排队等待 ~40s（generate 超时是 60s，安全）。
    ai_concurrency_limit: int = 20

    # 兼容旧字段（已不再使用，保留是为了让旧 .env 不报错）
    rate_limit_per_minute: int = 10
    rate_limit_per_day: int = 50

    # CORS
    # 逗号分隔的精确域名白名单，本地开发默认允许 vite 5173 / 5174。
    # 例：CORS_ORIGINS="https://app.example.com,https://staging.example.com"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174"
    # 用正则补一组动态域名（cloudflared 隧道子域是随机的，无法写死白名单）。
    # 留空表示不启用正则。
    cors_origin_regex: str = r"^https://[a-z0-9-]+\.trycloudflare\.com$"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
