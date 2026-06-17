"""Service for /tags/dynamic-cloud.

Tries the real model first; falls back to a deterministic mock pool when the
gateway is unreachable, the JSON is malformed, or the response shape doesn't
match the schema. The mock is the same one we shipped in step 1, kept here so
the frontend prefetch flow keeps working offline.
"""

import json
import logging
import random
from typing import cast

import httpx

from app.prompts.dynamic_tags import (
    DYNAMIC_TAGS_SYSTEM,
    DYNAMIC_TAGS_USER_TEMPLATE,
)
from app.schemas.common import CreationPath, FunnelStage, TagDTO
from app.schemas.tags import (
    DynamicCloudRequest,
    DynamicCloudResponse,
    DynamicTagAnalysis,
)
from app.services.ai_provider import AIError, call_tag_ai
from app.services.json_utils import extract_json

log = logging.getLogger(__name__)


_PATH_GAPS: dict[CreationPath, list[str]] = {
    "story": ["主角", "场景", "引发事件", "目标", "阻碍", "冲突", "反转", "结局基调"],
    "character": [
        "身份", "性格", "创伤", "核心欲望", "最大恐惧",
        "隐藏秘密", "关系冲突", "人物弧光",
    ],
    "worldview": [
        "时代", "核心法则", "规则代价", "禁忌", "组织势力",
        "社会影响", "世界真相",
    ],
}

_STAGE_GOALS: dict[CreationPath, dict[FunnelStage, str]] = {
    "story": {
        "spread": "找到故事的基本感觉——选人物、场景和类型词",
        "stitch": "把已选词连接成故事链——补起因、阻碍、线索",
        "narrow": "形成可生成梗概的核心结构——找真相、反转和结局钩子",
    },
    "character": {
        "spread": "打开人物可能性——选身份、职业和性格词",
        "stitch": "让角色产生内部矛盾——补创伤、欲望、秘密",
        "narrow": "让角色成为可写的人——确定核心动机和人物弧光",
    },
    "worldview": {
        "spread": "找到世界的核心想象力——选时代、制度和异常现象",
        "stitch": "让世界规则可运行——补规则代价、禁忌和势力",
        "narrow": "明确最重要的法则与冲突源——确认世界真相",
    },
}

_MOOD_WORDS = {"悬疑", "治愈", "荒诞", "惊悚", "阴郁", "压抑", "癫狂", "宁静", "悲壮", "温柔"}

_PATHS: tuple[CreationPath, ...] = ("story", "character", "worldview")


# ─── Mock pool ────────────────────────────────────────────────────────────────
# Used only when the AI gateway is unreachable. The frontend already has a
# much larger local word bank (drawBatch); these stay short on purpose.

_MOCK_POOL: dict[CreationPath, dict[FunnelStage, list[str]]] = {
    "story": {
        "spread": [
            "无声目击者", "倒叙婚礼", "记忆赝品", "双面来信", "陌生孩子",
            "深夜来电", "倒数第七天", "被替换的人", "未署名预言", "黄昏前的钟",
            "霓虹葬礼", "镜中对话", "雨季档案", "失语证词", "潜入老宅",
            "地图缺角", "海雾归途", "红线笔记", "深井回声", "断轨末班",
        ],
        "stitch": [
            "证人变卦", "凶器替换", "录音错位", "同一夜两次", "门缝纸条",
            "被改写的日记", "从未拍下的照片", "消失的目击", "暗号倒置", "时间戳错乱",
            "电梯多停一层", "钥匙不再合", "通话突然中断", "镜面不映人", "影子停顿",
        ],
        "narrow": [
            "她从未离开", "我们都是赝品", "门外是过去", "凶手在记忆里", "选择沉默才能活",
            "真相要由她亲手埋", "最后一次循环", "出口即入口", "回到那一晚改变",
        ],
    },
    "character": {
        "spread": [
            "调香师", "深夜咖啡师", "退役译者", "无名画师", "档案管理员",
            "前替身演员", "废墟讲解员", "情报黄牛", "古董修复师", "夜班守门人",
            "潦倒占星师", "厌世数学家", "失声歌手", "前法医", "记忆鉴定师",
        ],
        "stitch": [
            "对镜失声", "执拗到迟钝", "笑得很慢", "冷静地崩溃", "总在凌晨道歉",
            "对陌生人温柔", "把谎说成事实", "不能闻到雨味", "随身带胶卷",
        ],
        "narrow": [
            "她在替别人活", "他相信自己是冒名顶替者", "她其实不存在",
            "他选择记得错的版本", "她将用真相换取沉默",
        ],
    },
    "worldview": {
        "spread": [
            "潮汐立法", "情绪货币", "声音征税", "阴影户籍", "梦境配额",
            "记忆配给", "颜色管制", "时间黑市", "命运抽奖", "沉默节日",
            "镜面婚姻", "真名禁忌", "雨水征兵", "夜行许可", "倒影户口",
        ],
        "stitch": [
            "使用真名会折寿", "雨夜不得生火", "镜子破碎需向官府申报",
            "黄昏后不得直呼亲人", "梦的原文必须上交", "影子单独行动需备案",
        ],
        "narrow": [
            "规则其实是某人的诅咒", "整座城市是一个人的梦",
            "真相被写进日历的留白", "下一版规则将抹去所有旧名",
        ],
    },
}


# ─── Mock implementations ────────────────────────────────────────────────────

def _mock_analysis(
    path: CreationPath,
    stage: FunnelStage,
    selected_texts: list[str],
) -> DynamicTagAnalysis:
    if path == "story":
        seed = (
            f"已有元素：{('、'.join(selected_texts[:4]))}，故事轮廓正在成形。"
            if selected_texts
            else "故事还是一张白纸，先撒几个感兴趣的词。"
        )
    elif path == "character":
        seed = (
            f"一个{('、'.join(selected_texts[:3]))}的人物正在浮现。"
            if selected_texts
            else "角色还没有轮廓，从身份或性格词开始。"
        )
    else:
        seed = (
            f"世界核心：{('、'.join(selected_texts[:3]))}，规则开始运转。"
            if selected_texts
            else "世界观还是空白，先找一个核心想象力。"
        )

    gaps = [
        g for g in _PATH_GAPS[path]
        if not any(g[:2] in t for t in selected_texts)
    ]
    random.shuffle(gaps)
    missing = gaps[: max(2, 4 - len(selected_texts))]

    tone = next((t for t in selected_texts if t in _MOOD_WORDS), "未定型")

    reason = (
        f"当前还缺：{('、'.join(missing[:2]))}，建议继续选词补充。"
        if missing else "词汇已较完整，可以生成了。"
    )

    return DynamicTagAnalysis(
        storySeed=seed,
        currentGoal=_STAGE_GOALS[path][stage],
        missing=missing,
        tone=tone,
        reason=reason,
    )


def _mock_batch(
    path: CreationPath,
    stage: FunnelStage,
    exclude: set[str],
    count: int,
    escape: bool,
) -> list[TagDTO]:
    pool = list(_MOCK_POOL[path][stage])
    if escape:
        for other in cast(list[CreationPath], list(_PATHS)):
            if other == path:
                continue
            pool.extend(_MOCK_POOL[other]["spread"][:6])

    candidates = [t for t in pool if t not in exclude]
    random.shuffle(candidates)
    picked = candidates[:count]

    return [
        TagDTO(
            id=f"ai-{path[:2]}-{i}-{abs(hash(text)) % 10_000}",
            text=text,
            path=path,
            source="ai",
            stage=stage,
            isCrossover=escape,
        )
        for i, text in enumerate(picked)
    ]


def _mock_response(
    req: DynamicCloudRequest,
    *,
    degraded: bool = False,
    reason: str | None = None,
) -> DynamicCloudResponse:
    selected_texts = [t.text for t in req.selectedTags]
    exclude = set(req.excludeTexts) | set(selected_texts)
    return DynamicCloudResponse(
        stateKey=req.stateKey,
        path=req.path,
        stage=req.stage,
        analysis=_mock_analysis(req.path, req.stage, selected_texts),
        tags=_mock_batch(req.path, req.stage, exclude, req.count, req.escape),
        degraded=degraded,
        degradeReason=reason,
    )


# ─── AI parsing ──────────────────────────────────────────────────────────────

_VALID_PATHS = set(_PATHS)


def _parse_ai_response(
    raw: str,
    req: DynamicCloudRequest,
) -> DynamicCloudResponse:
    """Parse the model's JSON output into a DynamicCloudResponse.

    Raises AIError on any structural problem so the caller can fall back.
    """
    data = extract_json(raw)
    if not isinstance(data, dict):
        raise AIError(f"dynamic-cloud JSON is not an object: {type(data).__name__}")

    a = data.get("analysis")
    tags = data.get("tags")
    if not isinstance(a, dict) or not isinstance(tags, list):
        raise AIError("dynamic-cloud JSON missing analysis/tags")

    missing = a.get("missing") or []
    if not isinstance(missing, list):
        missing = []
    missing = [str(m) for m in missing if isinstance(m, str) and m]

    analysis = DynamicTagAnalysis(
        storySeed=str(a.get("storySeed") or ""),
        currentGoal=str(a.get("currentGoal") or _STAGE_GOALS[req.path][req.stage]),
        missing=missing,
        tone=str(a.get("tone") or "未定型"),
        reason=(str(a["reason"]) if a.get("reason") else None),
    )

    exclude = set(req.excludeTexts) | {t.text for t in req.selectedTags}
    out: list[TagDTO] = []
    seen: set[str] = set()
    for i, item in enumerate(tags):
        if not isinstance(item, dict):
            continue
        text = str(item.get("text") or "").strip()
        if not text or text in exclude or text in seen:
            continue
        if len(text) > 12:  # over-long phrases are likely a sentence — drop
            continue
        path_v = item.get("path")
        if path_v not in _VALID_PATHS:
            path_v = req.path
        out.append(
            TagDTO(
                id=f"ai-{path_v[:2]}-{i}-{abs(hash(text)) % 10_000}",
                text=text,
                path=cast(CreationPath, path_v),
                source="ai",
                stage=req.stage,
                isCrossover=bool(item.get("isCrossover", path_v != req.path)),
            )
        )
        seen.add(text)

    if not out:
        raise AIError("dynamic-cloud returned zero usable tags")

    return DynamicCloudResponse(
        stateKey=req.stateKey,
        path=req.path,
        stage=req.stage,
        analysis=analysis,
        tags=out[: req.count],
    )


# ─── Public entry ────────────────────────────────────────────────────────────

def _selected_tags_json(selected_tags: list[TagDTO]) -> str:
    return json.dumps(
        [{"text": t.text, "path": t.path, "source": t.source} for t in selected_tags],
        ensure_ascii=False,
    )


def _tags_json(req: DynamicCloudRequest) -> str:
    return _selected_tags_json(req.selectedTags)



async def dynamic_cloud(
    client: httpx.AsyncClient,
    req: DynamicCloudRequest,
) -> DynamicCloudResponse:
    user_prompt = DYNAMIC_TAGS_USER_TEMPLATE.format(
        path=req.path,
        stage=req.stage,
        escape=str(req.escape).lower(),
        count=req.count,
        selected_tags_json=_tags_json(req),
        exclude_texts_json=json.dumps(req.excludeTexts, ensure_ascii=False),
    )
    try:
        # 走快模型：动态词云不需要主模型的深思，前端已用 timeout=45s 兜底
        raw = await call_tag_ai(
            client, DYNAMIC_TAGS_SYSTEM, user_prompt,
            temperature=0.95, timeout=20.0,
        )
        return _parse_ai_response(raw, req)
    except (AIError, ValueError) as e:
        log.warning("dynamic_cloud: AI failed (%s); falling back to mock", e)
        # 标记 degraded 让前端能感知并显示提示 + 5s 后静默重试
        return _mock_response(req, degraded=True, reason="ai_unavailable")
