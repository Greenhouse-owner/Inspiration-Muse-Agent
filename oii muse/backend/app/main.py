from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.generate import router as generate_router
from app.api.health import router as health_router
from app.api.refine import router as refine_router
from app.api.tags import router as tags_router
from app.core.config import settings
from app.core.http_client import lifespan
from app.core.logging import RequestLogMiddleware, configure_logging

configure_logging()

app = FastAPI(title="oiioii Muse API", version="0.2.0", lifespan=lifespan)

# 中间件执行顺序是 LIFO：后 add 的先跑。这里 CORS 必须在最外层（最后 add），
# 这样错误响应也带 CORS header；请求日志放里层只记业务。
app.add_middleware(RequestLogMiddleware)

# CORS：精确白名单 + 可选正则。生产部署只能从 cors_origins / cors_origin_regex
# 注入域名，不再通配。method/header 也只允许实际用到的，缩小攻击面。
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_origin_regex=settings.cors_origin_regex or None,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "X-App-Token", "X-Client-Id"],
    max_age=600,  # 预检结果缓存 10 分钟，减少 OPTIONS 请求
)

app.include_router(health_router)
app.include_router(tags_router)
app.include_router(generate_router)
app.include_router(refine_router)
