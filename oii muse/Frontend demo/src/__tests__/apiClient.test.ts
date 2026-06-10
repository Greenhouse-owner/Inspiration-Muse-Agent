// apiClient 的回归测试。
//
// apiClient 是所有 service 的底座 —— 超时、abort、错误码处理都在这里。
// 这些断言在 C 阶段拆 hook 时会反复跑，确保任何对 apiClient 的"顺手优化"
// 都立刻被发现。
//
// 测试策略：mock global.fetch，断言：
//   1. 请求方法、headers、body 正确
//   2. 不同 HTTP 状态码 → ApiError 的字段
//   3. 超时 / abort 路径

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { apiPost, apiGet, ApiError } from '../app/services/apiClient';

// 备份原 fetch
const originalFetch = global.fetch;

beforeEach(() => {
  global.fetch = vi.fn();
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

function mockFetchOk<T>(body: T, status = 200) {
  (global.fetch as any).mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

function mockFetchError(status: number, detail?: any) {
  (global.fetch as any).mockResolvedValueOnce({
    ok: false,
    status,
    json: async () => detail ?? { detail: 'error' },
  });
}

function mockFetchThrows(err: Error) {
  (global.fetch as any).mockRejectedValueOnce(err);
}


describe('apiPost — 成功路径', () => {
  it('返回 res.json() 的内容', async () => {
    mockFetchOk({ result: 'hello' });
    const r = await apiPost<unknown, { result: string }>('/test', {});
    expect(r.result).toBe('hello');
  });

  it('以 POST 方法发请求', async () => {
    mockFetchOk({});
    await apiPost('/test', { x: 1 });
    const [, init] = (global.fetch as any).mock.calls[0];
    expect(init.method).toBe('POST');
  });

  it('Content-Type 是 application/json', async () => {
    mockFetchOk({});
    await apiPost('/test', { x: 1 });
    const [, init] = (global.fetch as any).mock.calls[0];
    expect(init.headers['Content-Type']).toBe('application/json');
  });

  it('带上 X-App-Token 头', async () => {
    mockFetchOk({});
    await apiPost('/test', { x: 1 });
    const [, init] = (global.fetch as any).mock.calls[0];
    expect(init.headers['X-App-Token']).toBeTruthy();
  });

  it('body 是 JSON 字符串化的请求', async () => {
    mockFetchOk({});
    await apiPost('/test', { foo: 'bar', n: 42 });
    const [, init] = (global.fetch as any).mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ foo: 'bar', n: 42 });
  });
});


describe('apiPost — 错误路径', () => {
  it('非 2xx → 抛 ApiError，含 status', async () => {
    mockFetchError(500, { detail: 'server error' });
    await expect(apiPost('/test', {})).rejects.toThrow(ApiError);
    try {
      await apiPost('/test', {});
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      // status 应反映服务端
    }
  });

  it('500 错误的 status 字段', async () => {
    mockFetchError(500);
    try {
      mockFetchError(500);  // 第二次给二次 await 用
      await apiPost('/test', {});
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).status).toBe(500);
    }
  });

  it('422 验证错误的 status 字段', async () => {
    mockFetchError(422, { detail: [{ msg: 'field required' }] });
    try {
      await apiPost('/test', {});
    } catch (e) {
      expect((e as ApiError).status).toBe(422);
    }
  });

  it('网络错误 → ApiError(status=0)', async () => {
    mockFetchThrows(new TypeError('Network request failed'));
    try {
      await apiPost('/test', {});
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).status).toBe(0);
    }
  });
});


describe('apiPost — abort / 超时', () => {
  it('外部 signal abort → ApiError(status=0)', async () => {
    const ctrl = new AbortController();
    // 让 fetch 永远不 resolve，靠 abort 中断
    (global.fetch as any).mockImplementation((_url: string, init: RequestInit) => {
      return new Promise((_, reject) => {
        init.signal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        });
      });
    });

    const promise = apiPost('/test', {}, { signal: ctrl.signal });
    ctrl.abort();
    await expect(promise).rejects.toThrow(ApiError);
  });

  it('signal 传入时已 abort → 立即失败', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    (global.fetch as any).mockImplementation((_url: string, init: RequestInit) => {
      return new Promise((_, reject) => {
        if (init.signal?.aborted) {
          reject(new DOMException('aborted', 'AbortError'));
        }
      });
    });

    await expect(apiPost('/test', {}, { signal: ctrl.signal })).rejects.toThrow(ApiError);
  });
});


describe('apiGet — 基本行为', () => {
  it('以 GET 方法发请求', async () => {
    mockFetchOk({});
    await apiGet('/test');
    const [, init] = (global.fetch as any).mock.calls[0];
    expect(init.method).toBe('GET');
  });

  it('带上 X-App-Token 头', async () => {
    mockFetchOk({});
    await apiGet('/test');
    const [, init] = (global.fetch as any).mock.calls[0];
    expect(init.headers['X-App-Token']).toBeTruthy();
  });

  it('GET 不带 body', async () => {
    mockFetchOk({});
    await apiGet('/test');
    const [, init] = (global.fetch as any).mock.calls[0];
    expect(init.body).toBeUndefined();
  });

  it('非 2xx → 抛 ApiError', async () => {
    mockFetchError(404);
    await expect(apiGet('/test')).rejects.toThrow(ApiError);
  });
});


describe('ApiError 形状', () => {
  it('构造时含 message + status + detail', () => {
    const e = new ApiError('boom', 502, { reason: 'gateway' });
    expect(e.message).toBe('boom');
    expect(e.status).toBe(502);
    expect(e.detail).toEqual({ reason: 'gateway' });
    expect(e.name).toBe('ApiError');
  });

  it('detail 可选', () => {
    const e = new ApiError('x', 500);
    expect(e.detail).toBeUndefined();
  });
});
