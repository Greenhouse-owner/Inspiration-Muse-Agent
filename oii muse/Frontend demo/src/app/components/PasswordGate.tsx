// 简易密码门 —— 公网 demo 用，防止陌生人访问烧 AI 额度。
//
// 使用：把正确密码放进 .env 的 VITE_DEMO_PASSWORD。
// 没设这个变量时密码门自动关闭（本地开发不会被卡）。
//
// 校验是纯前端比较，攻防意义有限，只是"门口贴个条"——如果你担心爆破，
// 应该在后端 verify_app_token 上再加一道。

import { useState, useEffect } from 'react';
import { T } from '../i18n/zh';
import { theme as C } from '../theme';

const STORAGE_KEY = 'oiimuse:demo:unlocked';

function readExpected(): string {
  // 用直接的 import.meta.env 形式，让 vite 静态替换为字面量；
  // 之前的 (import.meta as any)?.env 可选链会绕过 vite 的替换，
  // 导致打包后拿不到值，密码门直接放行。
  const v = import.meta.env.VITE_DEMO_PASSWORD as string | undefined;
  return (v ?? '').trim();
}

export function PasswordGate({ children }: { children: React.ReactNode }) {
  const expected = readExpected();
  const [unlocked, setUnlocked] = useState<boolean>(() => {
    if (!expected) return true;
    try {
      return localStorage.getItem(STORAGE_KEY) === expected;
    } catch {
      return false;
    }
  });
  const [input, setInput] = useState('');
  const [err, setErr]     = useState<string | null>(null);

  useEffect(() => {
    if (!expected) setUnlocked(true);
  }, [expected]);

  if (unlocked) return <>{children}</>;

  const submit = () => {
    if (input.trim() === expected) {
      try { localStorage.setItem(STORAGE_KEY, expected); } catch {}
      setUnlocked(true);
      setErr(null);
    } else {
      setErr(T.password.wrong);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', background: C.bg, color: C.text,
      fontFamily: "'Inter','PingFang SC','Helvetica Neue',system-ui,sans-serif",
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        width: '100%', maxWidth: 380,
        background: C.card, border: `1px solid ${C.border}`,
        borderRadius: 14, padding: '28px 26px 24px',
        boxShadow: '0 12px 44px rgba(0,0,0,.6)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: C.primary, boxShadow: `0 0 8px ${C.primary}`,
          }}/>
          <span style={{ color: C.primary, fontSize: 14, fontWeight: 700, letterSpacing: '.04em' }}>
            {T.password.brand}
          </span>
        </div>
        <p style={{ color: C.sub, fontSize: 13, lineHeight: 1.65, marginBottom: 18 }}>
          {T.password.tip}
        </p>

        <input
          type="password"
          value={input}
          onChange={e => { setInput(e.target.value); setErr(null); }}
          onKeyDown={e => { if (e.key === 'Enter') submit(); }}
          autoFocus
          placeholder={T.password.placeholder}
          style={{
            width: '100%', boxSizing: 'border-box',
            background: 'rgba(255,255,255,.04)',
            border: `1px solid ${err ? '#ff3860' : C.border}`,
            borderRadius: 8, padding: '10px 12px',
            color: C.text, fontSize: 14, outline: 'none',
            marginBottom: err ? 8 : 14,
            transition: 'border-color .15s ease',
          }}
          onFocus={e => { if (!err) (e.target as HTMLInputElement).style.borderColor = 'rgba(255,45,120,.45)'; }}
          onBlur={e => { if (!err) (e.target as HTMLInputElement).style.borderColor = C.border; }}
        />
        {err && (
          <div style={{ color: '#ff3860', fontSize: 12, marginBottom: 14 }}>{err}</div>
        )}
        <button
          onClick={submit}
          disabled={!input.trim()}
          style={{
            width: '100%', padding: '10px 14px',
            border: 'none', borderRadius: 8,
            background: input.trim() ? C.primary : 'rgba(255,45,120,.18)',
            color: input.trim() ? '#fff' : 'rgba(255,255,255,.4)',
            fontSize: 13, fontWeight: 700, letterSpacing: '.04em',
            cursor: input.trim() ? 'pointer' : 'default',
            transition: 'background .15s ease',
          }}
        >
          {T.password.submit}
        </button>
      </div>
    </div>
  );
}
