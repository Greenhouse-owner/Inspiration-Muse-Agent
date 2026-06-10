import httpx
from fastapi import APIRouter, Depends, Request

from app.core.http_client import get_ai_http_client
from app.core.rate_limit import check_rate_limit_expensive
from app.core.security import verify_app_token
from app.schemas.result import (
    GenerateCharacterResponse,
    GenerateRequest,
    GenerateStoryResponse,
    GenerateWorldviewResponse,
    InsertStoryChapterRequest,
    InsertStoryChapterResponse,
    StoryChaptersRequest,
    StoryChaptersResponse,
)
from app.services.generate_service import (
    generate_character,
    generate_story,
    generate_story_chapters,
    generate_worldview,
    insert_story_chapter,
)

router = APIRouter(prefix="/generate", dependencies=[Depends(verify_app_token)])


@router.post("/story", response_model=GenerateStoryResponse)
async def api_generate_story(
    request: Request,
    body: GenerateRequest,
    client: httpx.AsyncClient = Depends(get_ai_http_client),
):
    await check_rate_limit_expensive(request)
    return await generate_story(client, body)


@router.post("/character", response_model=GenerateCharacterResponse)
async def api_generate_character(
    request: Request,
    body: GenerateRequest,
    client: httpx.AsyncClient = Depends(get_ai_http_client),
):
    await check_rate_limit_expensive(request)
    return await generate_character(client, body)


@router.post("/worldview", response_model=GenerateWorldviewResponse)
async def api_generate_worldview(
    request: Request,
    body: GenerateRequest,
    client: httpx.AsyncClient = Depends(get_ai_http_client),
):
    await check_rate_limit_expensive(request)
    return await generate_worldview(client, body)


@router.post("/story/chapters", response_model=StoryChaptersResponse)
async def api_generate_story_chapters(
    request: Request,
    body: StoryChaptersRequest,
    client: httpx.AsyncClient = Depends(get_ai_http_client),
):
    await check_rate_limit_expensive(request)
    return await generate_story_chapters(client, body)


@router.post("/story/chapter/insert", response_model=InsertStoryChapterResponse)
async def api_insert_story_chapter(
    request: Request,
    body: InsertStoryChapterRequest,
    client: httpx.AsyncClient = Depends(get_ai_http_client),
):
    await check_rate_limit_expensive(request)
    return await insert_story_chapter(client, body)
