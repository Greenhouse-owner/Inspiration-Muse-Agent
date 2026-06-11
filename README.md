# Inspiration-Muse-Agent
A very interesting way to complete the creation by clicking on cards
# Inspiration Muse Agent · 灵感缪斯代理人

> **不需要写任何东西，只需要选几个词。**
>
> 一个动态灵感拼图生成器：通过点击词卡积累灵感，AI 把这些词组织成完整的故事梗概、角色设定或世界观。

🌐 **线上体验**：https://inspiration-muse-agent.pages.dev

---

## 这个产品是什么

oiioii Muse 是给写作 / 做角色卡 / 搭世界观的人用的"反向灵感工具"。

**传统的 AI 写作助手**：你写一段，它帮你接。问题是「白纸恐惧」—— 一开始什么都没有，最难。

**Muse 的做法**：让你**只点不写**。你只需要在 AI 给的词卡里点几个感兴趣的，AI 就把它们组织成完整结果。整个过程像玩拼图。

3 条创作路径：

| 路径 | 你能得到什么 |
|---|---|
| **故事梗概** | 一段几百字的故事大纲 + 可选拆分成 N 个章节 |
| **角色设定** | 完整的角色卡（身份、性格、创伤、欲望、秘密、人物弧光） |
| **世界观规则** | 一套可以运转的世界观（核心法则、禁忌、组织、真相） |

---

## 用户使用流程

整个交互发生在右下角的小精灵悬浮窗里。

```
1. 点小精灵图标       → 打开词云面板
       ↓
2. 选 2 个以上词卡    → AI 词云会动态推荐相关的下一批词
       ↓
3. 点"✦ 生成"        → 5–15 秒后出故事 / 角色卡 / 世界观卡
       ↓
4. 想改 → 在输入框写"主角改成女性"之类的修改要求 → AI 智能 refine
   想分章节 → 输入数字 "3" → 把故事拆成 3 章
   想加章节 → 章节卡片有"+"按钮，AI 在指定位置插入新章节
```

### 三个细节

- **词卡有两种来源**：本地 mock 词库（保证离线也能玩）+ AI 后台预取的动态词卡（你选完两个词就开始预取下一批，刷新时立即可用）
- **三阶段漏斗**：选词进度从"撒网期"→"串联期"→"收口期"，AI 推荐的词会从发散往聚合走
- **路径切换**：故事/角色/世界观 tab 可以随时切，每条路径独立维护词云状态

---

## 系统是怎么解决用户问题的

每个用户动作背后系统在做什么。下面 4 条是产品的核心交互路径。

### ① 用户选了一个词 → 系统在后台干啥

用户点一张词卡时，体验上只是"被加进锁定区"。但系统其实在做这些事：

```
用户点词
   │
   ├─→ 加进 selectedTags（页面立刻反映）
   │
   ├─→ 把这张词从词云批次移出，再补一张同源候选进来
   │   （让词云数量恒定 = 18 张，避免视觉抖动）
   │
   └─→ 触发后台 AI 预取（关键设计）
       │
       ├─→ 250ms 防抖：用户在快速连点时不发请求
       │
       └─→ 防抖完了：调 /tags/dynamic-cloud 让 mini 模型
           按"已选词 + 已用词"算下一批应该推什么
           → 结果先放进"蓄水池"，不立刻用
```

**为什么这么设计**：用户思考"下一个选啥"通常要 3-5 秒。这 3-5 秒不抢用户视线，把 AI 推荐拉到本地。等用户按"换一批"时，蓄水池里的 AI 词立即可见 → **零等待**。

如果不这么做：用户按"换一批"才发请求 → 等 1-2 秒看到新词 → 体验断崖。

### ② 用户按"✦ 生成" → 怎么从几个词变成一段故事

```
用户点"生成"
   │
   ▼
[前端] useGeneration.generate()
   │
   ├─→ 立刻把 thinking 状态推上去（精灵开始转圈）
   ├─→ 把"已选词：A、B、C"作为用户消息插进对话流（用户立刻有反馈）
   │
   ├─→ 调后端 /generate/story（或 character / worldview）
   │      │
   │      ▼
   │   [后端] generate_service
   │      │
   │      ├─→ 检查 X-Client-Id 限流（expensive 桶，30/min · 1000/day）
   │      ├─→ 检查全局熔断（600/min，防 AI 网关被打爆）
   │      │
   │      ├─→ 抢占 asyncio.Semaphore(12) 一个 slot
   │      │   （限制同时调 AI 的请求数，多了排队不挤兑下游）
   │      │
   │      ├─→ 拼 system + user prompt（在 prompts/ 目录里）
   │      ├─→ 调主模型（Claude Sonnet）OpenAI 兼容协议
   │      │     ↓ 主网关挂了？
   │      │   自动切 fallback 网关重试
   │      │
   │      └─→ 解析返回 JSON，构造 StoryResult / CharacterResult / WorldviewResult
   │
   └─→ 拿到结果后：
       ├─→ setCurrentResult(result)（按钮从"+加入"切换成"↑发送"模式）
       ├─→ 推一条 muse 消息渲染卡片
       ├─→ 清空已选词 + 重撒词云（进入下一轮）
       └─→ 故事路径：追加一条"想分章节？输入数字 1-20"hint
```

**关键点**：
- 故事 / 角色 / 世界观这三条路径走的是**完全不同的 prompt** 和**完全不同的输出 schema**，但前端只暴露一个"生成"按钮 —— 路径是上方 tab 决定的，用户不用学三个流程。
- 限流维度是 `X-Client-Id`（前端 localStorage UUID）而不是 IP 或 token。**因为 100 人共用同一个 APP_TOKEN 且常在同一 NAT 出口下**，按 IP / token 都会让用户互相挤兑。

### ③ 用户输入"主角改成女性" → 系统怎么知道是改故事还是改章节

这是 smart refine，最难的一段交互。

```
用户输入文本 → 点 ↑
   │
   ▼
[前端] parseIntent(text) 用规则解析意图
   │
   ├── 是纯数字 1-20？  → kind = chapters（拆分章节）
   ├── 长度太短？        → kind = invalid（提示"再多说点"）
   ├── 是空字符串？      → kind = empty（不发请求）
   └── 其它              → kind = refine（调 refine-smart）
                              │
                              ▼
                  [后端] refine_smart endpoint
                              │
                              │ 注意：这一步不是写死改什么，
                              │ 是把"故事 + 章节（如果有）+ 用户要求"
                              │ 一起塞给 AI，让 AI 自己判断该改哪部分。
                              │
                              ▼
                  AI 返回 { story?, chapters?, note? }
                  ├── 改了故事 → 替换 currentResult
                  ├── 改了章节 → 替换 chapters 列表
                  ├── 改了两者 → 都替换 + 渲染两条消息
                  └── 都没改   → note 提示用户"没找到合理的修改方案"
```

**关键设计**：用户不需要告诉系统"我要改的是 X 部分"。系统让 AI 自己判断。例如：
- "主角改成女性" → AI 改故事 + 同步改章节里的人称
- "第二章太短了" → AI 只改章节
- "去掉所有暴力情节" → 故事 + 章节都改

如果硬要用户在 UI 上选"改故事 / 改章节" → 用户要做认知判断 → 慢且容易选错。所以这部分**故意把决策权交给 AI**。

### ④ 词卡蓄水池 + 滑动窗口 = 不重复推荐

这是后台一直在跑的隐形机制：

```
词卡来源 = 本地词库（保底） + AI 预取池（蓄水池）

每次刷新一批 18 张词时：
   ├─→ 从蓄水池拿 N 张 AI 词（保证有新意）
   ├─→ 从本地词库补 18-N 张（保证够数）
   ├─→ 排除"已选词" + "已显示过的词"
   │      │
   │      └─→ 已显示过的词放在 excludeTexts 列表里维护
   │          （滑动窗口，最多记 50 个，超出丢最早的）
   │
   └─→ 把这 18 张同时发给 AI 让它知道"已经发散过这些"
        → AI 推下一批时会避开
```

**没有这套机制**：用户按 5 次"换一批"会看到大量重复词卡 → 觉得 AI 不智能。

**有这套机制**：用户按"换一批"看到的总是新词 + 跟当前已选词有"逻辑距离"（不是同义词，是相关概念）。

---

## 三个核心模块

把上面 4 条路径拆开看，前后端各有 3 个核心模块：

### 前端（React hooks 分领域）

| Hook | 干什么 | 触发它的用户动作 |
|---|---|---|
| **useTagCloud** | 维护词云 / 选词 / 滑动窗口 / 阶段切换 | 选词、换一批、跳出去 |
| **useAiCachePrefetch** | 后台 AI 预取，蓄水池随时备货 | 选词后 250ms 自动触发，用户感知不到 |
| **useGeneration** | 调生成 + smart refine | 点"生成"、输入修改要求 |
| **useChapters** | 章节列表 / 删除 / 插入 | 输入数字、点章节卡上的删除/+ |

[Fairy.tsx](oii%20muse/Frontend%20demo/src/app/components/Fairy.tsx)（600 行）只负责 render + 调度，所有真正的状态管理都在上面 4 个 hook 里。

**协作技巧**：4 个 hook 通过共享的 `inflightRef`（abort controller）协作。任何一个发新请求都先 `abort()` 飞着的旧请求 → 用户连点也不会有响应错位。

### 后端（FastAPI 分层）

| 层 | 文件 | 职责 |
|---|---|---|
| **API** | [api/](oii%20muse/backend/app/api/) | 路由 + 鉴权 + 限流入口 |
| **Service** | [services/](oii%20muse/backend/app/services/) | 业务逻辑（拼 prompt + 调 AI + JSON 解析 + 失败兜底） |
| **AI Provider** | [ai_provider.py](oii%20muse/backend/app/services/ai_provider.py) | 唯一对接 AI 网关的地方，主→fallback 链 + Semaphore 并发控制 |

**两档限流**（[rate_limit.py](oii%20muse/backend/app/core/rate_limit.py)）：

| 档 | 端点 | 默认额度 | 命中后果 |
|---|---|---|---|
| **expensive** | /generate/* /result/* | 30/min · 1000/day | 429 |
| **cheap** | /tags/dynamic-cloud | 120/min · 10000/day | 429 |
| **global** | 所有端点 | 600/min | 503（防 AI 网关被打爆） |

**两档模型**：故事 / 角色 / 世界观用 Claude Sonnet（质量），词卡推荐用 gpt-4o-mini（速度，低延迟）。两条链独立 key 独立计费，互不影响。

---

## 仓库目录

```
oii muse/
├── Frontend demo/              # React 18 + Vite 6 + TypeScript
│   └── src/app/
│       ├── components/Fairy.tsx          # 主壳（render + 调度）
│       ├── features/fairy/
│       │   ├── components/               # UI 组件（CharacterCard 等）
│       │   ├── hooks/                    # 业务 hook（见上表）
│       │   ├── helpers.ts                # 纯工具
│       │   └── types.ts
│       ├── services/                     # API 客户端 + 业务请求
│       ├── data/localTags.ts             # 本地词库 + 路径定义
│       ├── i18n/zh.ts                    # 中文文案
│       └── config.ts                     # 行为参数（阈值、防抖时长等）
│
└── backend/                    # FastAPI + Python 3.11
    └── app/
        ├── main.py                       # FastAPI 入口 + 中间件
        ├── api/                          # endpoint 路由
        ├── core/
        │   ├── security.py               # X-App-Token 校验
        │   ├── rate_limit.py             # 分桶限流 + 全局熔断
        │   ├── http_client.py            # 共享 httpx 连接池
        │   └── logging.py                # stdout JSON + 请求日志
        ├── services/                     # 业务逻辑
        ├── prompts/                      # AI prompts（按 endpoint 分文件）
        └── schemas/                      # pydantic 请求/响应模型
```

---

## 本地开发

### 前置

- **Node.js** 20+（前端）
- **Python** 3.11（后端）
- AI 网关账号（itlsj 或任何 OpenAI 兼容网关）

### 后端

```bash
cd "oii muse/backend"
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 复制模板填 AI key
cp .env.example .env
# 编辑 .env，填 AI_API_KEY / AI_API_BASE_URL / APP_TOKEN

# 跑起来
uvicorn app.main:app --reload --port 8000
```

健康检查：`curl http://127.0.0.1:8000/health` 应返回 `{"ok":true,...}`

### 前端

```bash
cd "oii muse/Frontend demo"
npm install

# 开发模式（vite dev server 把 /api/* 反代到 :8000）
npm run dev

# 浏览器打开 http://localhost:5173
```

`.env.local` 里设 `VITE_APP_TOKEN=local-dev-token`（或你后端 .env 里的同值）。

### 测试

```bash
cd "oii muse/Frontend demo"
npm test          # 跑一次（64 个测试）
npm run test:watch # watch 模式
```

测试覆盖：词库 / API client / inputIntent 解析 / 服务层 mock。

---

## 部署

完整流程见 [LAUNCH.md](oii%20muse/LAUNCH.md)。简版：

| 组件 | 平台 | 配置 |
|---|---|---|
| 前端 | Cloudflare Pages | Root: `oii muse/Frontend demo`，Framework: None，Build: `npm run build`，Output: `dist` |
| 后端 | Railway | Root: `oii muse/backend`，自动读 `railway.json` 启动 uvicorn |

**部署后必做**：
1. 在 Railway Variables 设 `CORS_ORIGINS=https://你的pages域名`，否则浏览器全 CORS 报错
2. 在 AI 网关后台**设单日预算上限**（这是唯一真正能挡住账单爆炸的东西）

---

## 技术栈

| 层 | 选型 | 为什么 |
|---|---|---|
| 前端框架 | React 18 | 团队熟、生态稳 |
| 构建工具 | Vite 6 | 启动 < 200ms，dev/prod 配置统一 |
| 类型 | TypeScript 5 | 重构 hook 时编译期捕错 |
| 测试 | Vitest + jsdom | 跟 Vite 共享配置，跑 64 个测试 < 1s |
| 后端框架 | FastAPI | async + pydantic + 自动文档 |
| HTTP 客户端 | httpx[http2] | 共享连接池，trust_env=False 避免代理坑 |
| 配置 | pydantic-settings | type-safe 读 .env |
| 部署 | Cloudflare Pages + Railway | 都有免费层，国内访问 CF 稳定 |

---

## 许可

MIT
