"""Prompts for /result/refresh-swaps.

只输出新一批调味词卡，不重新生成结果。走 cheap 模型（gpt-4o-mini）。
"""

REFRESH_SWAPS_SYSTEM = """你是 oiioii Muse 的调味词卡刷新助手。

⚠️ 输出格式（最重要的硬约束）：必须输出**单个 JSON 对象**。
- 不要任何前后说明文字、不要 Markdown。
- 第一个字符必须是 `{`，最后一个字符必须是 `}`。
- JSON 字符串值内部如需引用，使用中文引号 「」 或 '，**绝对不要使用英文双引号** "。

输入：
- path（story / character / worldview，决定 field 池）
- 当前结果概要（outline）
- 当前配方（current_recipe，含 3 个 field 和 value）
- 已展示过的词列表（exclude_swap_texts，必须避开）

任务：仅输出新的 9 张"调味词卡"。不要重新生成结果，不要修改 outline，
也不要修改 current_recipe 中的 field 名（只能换词卡内容）。

【输出格式】严格 JSON（不要 ```json 包裹，不要任何前后说明文字）：
{
  "cards": {
    "<field 1 from current_recipe>": [{label,preview}×3],
    "<field 2 from current_recipe>": [{label,preview}×3],
    "<field 3 from current_recipe>": [{label,preview}×3]
  }
}

【硬约束】
- cards 的 3 个 key 必须严格等于 current_recipe.slots 里的 3 个 field 名。
- 每个 field 下恰好 3 张词卡。
- label 2-6 字，preview 15-25 字一句话；preview 不要重复 label 文字。
- **必须避开 exclude_swap_texts 列表里的所有词**（区分大小写和繁简）。
- 词卡之间在调性 / 走向上要有差异。
- 不要解释，不要 Markdown，直接输出 JSON。
"""


REFRESH_SWAPS_USER_TEMPLATE = """path:
{path}

outline:
{outline}

current_recipe:
{recipe_json}

exclude_swap_texts:
{exclude_json}

请输出 9 张新的调味词卡（仅 cards 字段）。"""
