// 后端 API 客户端 — 封装 baseURL / X-App-Token / 错误处理 / 超时
//
// 用 vite 的 import.meta.env：
//   VITE_API_BASE_URL  — 后端地址。默认 '/api'，由 vite dev server 反代到 8000，
//                        这样开发 / cloudflared 隧道 / 同站部署都只需要一条 URL。
//                        想直连后端时可以覆盖成 'http://127.0.0.1:8000'。
//   VITE_APP_TOKEN     — 与后端 APP_TOKEN 对应；本地开发可用 "local-dev-token"

const BASE_URL =
  (import.meta as any)?.env?.VITE_API_BASE_URL?.replace(/\/+$/, '') ||
  '/api';

const APP_TOKEN = (import.meta as any)?.env?.VITE_APP_TOKEN || 'local-dev-token';

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
