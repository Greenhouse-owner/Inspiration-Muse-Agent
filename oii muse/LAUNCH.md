# oiioii Muse 上线 Checklist（明天 100 人内测）

## 📊 成本估算

**配置**：generate/refine 1000 次/人/天 · tags 10000 次/人/天 · 100 人 · `claude-sonnet-4-6`

**额度只是"极限拦截"**——挡 token 泄漏后的恶意脚本。友好用户感知不到。

| 接口 | 平均输入 | 平均输出 | 单次成本 ≈ | 80 人活跃 / 天（每人 30 次）|
|---|---|---|---|---|
| story / character / worldview | 600 tok | 400 tok | $0.008 | 80 × 30 = 2400 次 → **$19** |
| refine-smart（带章节） | 1500 tok | 600 tok | $0.014 | 80 × 10 = 800 次 → **$11** |
| dynamic-cloud（mini 模型） | 400 tok | 200 tok | $0.0003 | 80 × 200 = 16000 次 → **$5** |
| **合计** | | | | **~$35 / 天 ≈ ¥250 / 天** |

> 上面是**预期消耗**（用户正常使用）。**成本上限**取决于：① 你在 AI 网关后台设的预算上限（最重要，**今晚必去设**）；② 限流（用户层 1000 次/天 + 全局 600/分钟）。
>
> ⚠️ Sonnet 比 Haiku 贵 4x。如果想压成本，把 `AI_MODEL` 切到 `claude-haiku-4-5-20251001`，单天成本能压到 **¥80 以内**。

---

## ✅ 上线步骤（按顺序做，每步打勾）

### 1. 后端部署 — Railway

- [ ] 登录 [railway.app](https://railway.app) → New Project → Deploy from GitHub repo
- [ ] 选这个仓库，Root Directory 设为 `oii muse/backend`
- [ ] **环境变量**（Settings → Variables，从本地 `.env` 复制）：
  ```
  AI_API_BASE_URL=...
  AI_API_KEY=...
  AI_MODEL=claude-sonnet-4-6
  TAG_AI_API_BASE_URL=...
  TAG_AI_API_KEY=...
  TAG_AI_MODEL=gpt-4o-mini-2024-07-18
  FALLBACK_AI_API_BASE_URL=...
  FALLBACK_AI_API_KEY=...
  FALLBACK_AI_MODEL=...
  APP_TOKEN=<生成一个长随机串，明天给用户>
  CORS_ORIGINS=https://你的pages域名.pages.dev
  CORS_ORIGIN_REGEX=^https://[a-z0-9-]+\.[a-z0-9-]+\.pages\.dev$
  ```
  > Vercel 每次预览都给一个 `<branch>-<hash>.vercel.app` 子域，所以正则把 `*.vercel.app` 都放行。
- [ ] 等部署完成 → 拿到 Railway 域名 `https://xxx.up.railway.app`
- [ ] 浏览器访问 `https://xxx.up.railway.app/health`，看到 `{"ok":true,...}` = 后端 OK

### 2. 前端部署 — Cloudflare Pages

- [ ] 登录 [dash.cloudflare.com](https://dash.cloudflare.com) → 左侧 **Workers & Pages** → **Create** → **Pages** tab → **Connect to Git**
- [ ] 授权 GitHub → 选这个仓库
- [ ] **Build settings**：
  - Framework preset: `Vite`
  - Build command: `npm run build`
  - Build output directory: `dist`
  - Root directory（高级设置）: `oii muse/Frontend demo`
- [ ] **Environment variables**（Settings → Environment variables → Production）：
  ```
  VITE_API_BASE_URL=https://xxx.up.railway.app
  VITE_APP_TOKEN=<和 Railway 的 APP_TOKEN 相同>
  ```
- [ ] Save and Deploy → 等 1-2 分钟 → 拿到 `https://xxx.pages.dev`
- [ ] **回到 Railway 把 `CORS_ORIGINS` 更新成实际的 Pages 域名**（跨服务依赖，最容易漏）
  ```
  CORS_ORIGINS=https://xxx.pages.dev
  CORS_ORIGIN_REGEX=^https://[a-z0-9-]+\.xxx\.pages\.dev$
  ```
  > Cloudflare Pages 给每个 commit 一个预览子域 `<hash>.xxx.pages.dev`，正则放行用。

### 3. 端到端测试（明天发链接前必做）

打开 Vercel 域名，按顺序测：

- [ ] 选 2 个词 → 点"生成故事" → 出文本（验证 expensive 限流 + AI 网关）
- [ ] 输入"3" → 出 3 个章节（验证章节生成）
- [ ] 输入"主角改成女性" → refine 成功（验证 smart refine）
- [ ] 切到"角色"路径 → 选词生成 → 出角色卡
- [ ] 打开 Railway Logs，确认每个请求都有结构化 JSON 行（rid / cid / dur_ms）

> 现在限流额度调宽了（expensive 30/min · 1000/day），手动测不出 429。如果真要验证限流生效，用 curl 循环 35 次同一接口才会触发。

### 4. 给用户发链接

- 链接：`https://xxx.pages.dev`
- 提醒：建议用 Chrome / Edge / Safari 桌面版（手机能用但 UI 没专门优化）
- **不要发 APP_TOKEN 给用户** —— token 已经编进前端 bundle，用户访问就自动带

---

## 🚨 应急预案

| 症状 | 排查 | 修复 |
|---|---|---|
| 用户全 401 | Railway env 没设 `APP_TOKEN`，或 Vercel 的 `VITE_APP_TOKEN` 不一致 | 对齐两边 token，重启 Railway，redeploy Vercel |
| 用户全 CORS 报错 | Railway `CORS_ORIGINS` 写错 / 没设 | 改成实际 Vercel 域名，重启 Railway |
| 用户全 503 "Server is busy" | 全局熔断打满（120/min） | 调高 `RATE_LIMIT_GLOBAL_PER_MINUTE`，或检查是否有人压测 |
| 单个用户 429 但其它人正常 | 那个人选词太频繁打满 cheap 桶 | 让他换浏览器（清 localStorage 重置 client-id），或调高 `RATE_LIMIT_CHEAP_PER_DAY` |
| AI 网关全失败 | 主网关挂 + 没配 fallback | 检查 fallback env，或临时切 `AI_API_BASE_URL` |
| 成本飙到一半就报警 | 真实使用量超预期 | Railway 调低 `RATE_LIMIT_EXPENSIVE_PER_DAY`（生效不需要重启吗？需要重启） |

---

## 🔍 实时监控

- **Railway Logs**（看请求级日志）：
  - 找慢请求：grep `dur_ms":[1-9][0-9]{4}` （>10s 的）
  - 找错误：grep `"status": 5` （5xx）
  - 找限流命中：grep `"status": 429`
- **AI 网关后台**（看花了多少钱）：每小时刷一次

---

## ⚠️ 已知风险

1. **限流是进程内 dict，不持久化** —— Railway 重启 / 部署后所有人额度清零。重启时通知用户。
2. **APP_TOKEN 是单一共享 token** —— 一旦泄漏（截图 / 抓包），任何人都能调你的 AI key 烧钱。计划：明晚 24:00 后轮换 token，前端 redeploy。
3. **没有 AI 调用成本上限** —— 软限制是 rate_limit。硬上限只能在 AI 网关后台设。**今晚必须去 AI 网关后台设单日预算上限。**
4. **Vercel / Railway 免费额度** —— Vercel 100GB / 月 带宽，Railway 每月 $5 免费。100 人内测够用，但**别让人压测**。
