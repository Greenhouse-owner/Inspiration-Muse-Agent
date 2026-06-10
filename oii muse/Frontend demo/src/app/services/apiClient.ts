// 后端 API 客户端 — 封装 baseURL / X-App-Token / 错误处理 / 超时
//
// API base URL 解析顺序：
//   1. import.meta.env.VITE_API_BASE_URL（构建时注入，Vercel/Cloudflare Pages env var）
//   2. 如果是 *.pages.dev 子域 → 自动指向生产 Railway 后端（兜底，防 env var 没生效）
//   3. 默认 '/api'，由 vite dev server 反代到本地 backend
//
// VITE_APP_TOKEN：与后端 APP_TOKEN 对应；本地开发可用 "local-dev-token"

const PROD_BACKEND = 'https://inspiration-muse-agent-production.up.railway.app';

function resolveBaseUrl(): string {
  const fromEnv = (import.meta as any)?.env?.VITE_API_BASE_URL?.replace(/\/+$/, '');
  if (fromEnv) return fromEnv;
  // pages.dev 部署兜底：env var 没生效时也别打到自己（会 405）
  if (typeof window !== 'undefined' && /\.pages\.dev$/.test(window.location.hostname)) {
    return PROD_BACKEND;
  }
  return '/api';
}

const BASE_URL = resolveBaseUrl();

// APP_TOKEN：构建时注入。pages.dev 兜底用生产 token，防止 env var 没生效。
function resolveAppToken(): string {
  const fromEnv = (import.meta as any)?.env?.VITE_APP_TOKEN;
  if (fromEnv) return fromEnv;
  if (typeof window !== 'undefined' && /\.pages\.dev$/.test(window.location.hostname)) {
    return 'muse-2026-MNqRtvWxyZ';
  }
  return 'local-dev-token';
}
const APP_TOKEN = resolveAppToken();

// X-Client-Id：每个浏览器独立 ID，作为后端限流的分桶 key。
// 100 个内部用户共享同一个 APP_TOKEN，仅靠 token / IP 分桶都会让用户互相挤兑。
// 落 localStorage：清浏览器数据会重置，可接受。
const CLIENT_ID = (() => {
  try {
    const KEY = 'muse-client-id';
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = (crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`);
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    // 隐私模式 / sandbox 拿不到 localStorage：每次新开 tab 一个 id，体验略差但能用
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
})();

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public detail?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface PostOptions {
  timeoutMs?: number; // 默认 60s
  signal?: AbortSignal;
}

export async function apiPost<TReq, TRes>(
  path: string,
  body: TReq,
  opts: PostOptions = {},
): Promise<TRes> {
  const { timeoutMs = 60_000, signal } = opts;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  if (signal) {
    if (signal.aborted) ctrl.abort();
    else signal.addEventListener('abort', () => ctrl.abort(), { once: true });
  }

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-App-Token': APP_TOKEN,
        'X-Client-Id': CLIENT_ID,
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });

    if (!res.ok) {
      let detail: unknown = undefined;
      try { detail = await res.json(); } catch { /* ignore */ }
      throw new ApiError(
        `API ${path} failed: ${res.status}`,
        res.status,
        detail,
      );
    }
    return (await res.json()) as TRes;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if ((e as Error)?.name === 'AbortError') {
      throw new ApiError('Request aborted or timed out', 0);
    }
    throw new ApiError((e as Error)?.message ?? 'Network error', 0);
  } finally {
    clearTimeout(timer);
  }
}

export async function apiGet<TRes>(path: string, opts: PostOptions = {}): Promise<TRes> {
  const { timeoutMs = 30_000, signal } = opts;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  if (signal) {
    if (signal.aborted) ctrl.abort();
    else signal.addEventListener('abort', () => ctrl.abort(), { once: true });
  }
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'GET',
      headers: { 'X-App-Token': APP_TOKEN },
      signal: ctrl.signal,
    });
    if (!res.ok) {
      let detail: unknown = undefined;
      try { detail = await res.json(); } catch { /* ignore */ }
      throw new ApiError(`API ${path} failed: ${res.status}`, res.status, detail);
    }
    return (await res.json()) as TRes;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if ((e as Error)?.name === 'AbortError') {
      throw new ApiError('Request aborted or timed out', 0);
    }
    throw new ApiError((e as Error)?.message ?? 'Network error', 0);
  } finally {
    clearTimeout(timer);
  }
}
