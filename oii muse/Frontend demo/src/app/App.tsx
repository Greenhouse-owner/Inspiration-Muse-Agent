import { Fairy } from "./components/Fairy";
import { PasswordGate } from "./components/PasswordGate";
import { T } from "./i18n/zh";
import { theme as C } from "./theme";

/* MARKER-MAKE-KIT-INVOKED */

// ─── Components ───────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
      <span style={{ width: 20, height: 1, background: C.primary, display: 'inline-block' }}/>
      <span style={{ color: C.sub, fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase' }}>
        {children}
      </span>
    </div>
  );
}

function Card({ children, accent }: { children: React.ReactNode; accent?: string }) {
  return (
    <div
      style={{
        background: C.card, border: `1px solid ${C.border}`,
        borderRadius: 10, padding: '20px 20px 18px',
        transition: 'border-color .2s ease, box-shadow .2s ease', cursor: 'default',
      }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.borderColor = accent ? `${accent}55` : 'rgba(255,45,120,.35)';
        el.style.boxShadow   = `0 0 24px ${accent ? accent + '10' : 'rgba(255,45,120,.06)'}`;
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.borderColor = C.border;
        el.style.boxShadow   = 'none';
      }}
    >
      {children}
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <PasswordGate>
    <div style={{
      minHeight: '100vh', background: C.bg, color: C.text,
      fontFamily: "'Inter','PingFang SC','Helvetica Neue',system-ui,sans-serif",
      position: 'relative', overflowX: 'hidden',
    }}>
      {/* Ambient glow */}
      <div style={{
        position: 'fixed', top: '8%', right: '8%', width: 560, height: 560,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(255,45,120,.05) 0%, transparent 68%)',
        pointerEvents: 'none', zIndex: 0,
      }}/>
      <div style={{
        position: 'fixed', bottom: '10%', left: '-5%', width: 400, height: 400,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(255,45,120,.03) 0%, transparent 70%)',
        pointerEvents: 'none', zIndex: 0,
      }}/>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header style={{
        borderBottom: `1px solid ${C.border}`, padding: '18px 40px',
        display: 'flex', alignItems: 'center', gap: 12,
        position: 'sticky', top: 0,
        background: 'rgba(13,13,13,.88)', backdropFilter: 'blur(12px)', zIndex: 100,
      }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          background: C.primary, boxShadow: `0 0 8px ${C.primary}`,
          display: 'inline-block', flexShrink: 0,
        }}/>
        <span style={{ color: C.text, fontSize: 15, fontWeight: 700 }}>{T.landing.brand}</span>
        <span style={{ width: 1, height: 14, background: C.border, display: 'inline-block', margin: '0 4px' }}/>
        <span style={{ color: C.sub, fontSize: 13 }}>{T.landing.brandSub}</span>
        <div style={{ marginLeft: 'auto' }}>
          <span style={{
            padding: '4px 12px', borderRadius: 20,
            border: `1px solid rgba(255,45,120,.3)`,
            background: 'rgba(255,45,120,.07)',
            color: C.primary, fontSize: 11, fontWeight: 700, letterSpacing: '.04em',
          }}>{T.landing.badgeBeta}</span>
        </div>
      </header>

      <main style={{ maxWidth: 860, margin: '0 auto', padding: '64px 32px 180px', position: 'relative', zIndex: 1 }}>

        {/* ── Hero ───────────────────────────────────────────────────────────── */}
        <section style={{ marginBottom: 80 }}>
          <div style={{ marginBottom: 18 }}>
            <span style={{
              padding: '4px 12px', borderRadius: 20,
              border: `1px solid rgba(255,45,120,.25)`,
              background: 'rgba(255,45,120,.07)',
              color: 'rgba(255,45,120,.8)', fontSize: 11, fontWeight: 700, letterSpacing: '.06em',
            }}>{T.landing.badgeProductTag}</span>
          </div>

          <h1 style={{
            fontSize: 'clamp(30px,5.5vw,52px)', fontWeight: 800, color: C.text,
            lineHeight: 1.15, marginBottom: 18, letterSpacing: '-.01em',
          }}>
            {T.landing.heroTitle}<br/>
            <span style={{ color: C.primary }}>{T.landing.heroTitleHl}</span>
          </h1>

          <p style={{
            color: C.sub, fontSize: 16, lineHeight: 1.7, maxWidth: 540, marginBottom: 32,
          }}>
            {T.landing.heroDesc}
          </p>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {T.landing.heroChips.map(item => (
              <div key={item.text} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 14px', borderRadius: 8,
                border: `1px solid ${C.border}`,
                background: 'rgba(255,255,255,.03)',
                color: C.sub, fontSize: 12,
              }}>
                <span>{item.icon}</span> {item.text}
              </div>
            ))}
          </div>
        </section>

        {/* ── Feature cards ──────────────────────────────────────────────────── */}
        <section style={{ marginBottom: 72 }}>
          <SectionLabel>{T.landing.sectionFeatures}</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
            {T.landing.featureCards.map(card => (
              <Card key={card.title}>
                <span style={{ fontSize: 22, display: 'block', marginBottom: 10 }}>{card.icon}</span>
                <div style={{ color: C.text, fontSize: 14, fontWeight: 600, marginBottom: 6 }}>{card.title}</div>
                <div style={{ color: C.sub, fontSize: 13, lineHeight: 1.6 }}>{card.desc}</div>
              </Card>
            ))}
          </div>
        </section>

        {/* ── Three funnel stages ─────────────────────────────────────────────── */}
        <section style={{ marginBottom: 72 }}>
          <SectionLabel>{T.landing.sectionFunnel}</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
            {T.landing.funnelStages.map(s => (
              <Card key={s.label} accent={s.color}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, boxShadow: `0 0 6px ${s.color}`, display: 'inline-block' }}/>
                  <span style={{ color: s.color, fontSize: 13, fontWeight: 700 }}>{s.label}</span>
                </div>
                <div style={{ color: C.sub, fontSize: 12, lineHeight: 1.6, marginBottom: 12 }}>{s.desc}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {s.words.map(w => (
                    <span key={w} style={{
                      padding: '3px 8px', borderRadius: 5,
                      background: '#2A2A2A', border: `1px solid ${C.border}`,
                      color: '#CCCCCC', fontSize: 11,
                    }}>{w}</span>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        </section>

        {/* ── How it works ────────────────────────────────────────────────────── */}
        <section style={{ marginBottom: 72 }}>
          <SectionLabel>{T.landing.sectionFlow}</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
            {T.landing.archSteps.map((s, i) => (
              <div key={s.step} style={{
                background: C.card, border: `1px solid ${C.border}`,
                borderRadius: 10, padding: '18px 18px 16px', position: 'relative', overflow: 'hidden',
              }}>
                <div style={{
                  position: 'absolute', top: 10, right: 14,
                  fontSize: 28, fontWeight: 800, color: 'rgba(255,45,120,.07)', lineHeight: 1,
                }}>{s.step}</div>
                {i < T.landing.archSteps.length - 1 && (
                  <div style={{
                    position: 'absolute', right: -7, top: '50%',
                    transform: 'translateY(-50%)', color: 'rgba(255,45,120,.2)', fontSize: 14, zIndex: 2,
                  }}>→</div>
                )}
                <div style={{ color: C.primary, fontSize: 13, fontWeight: 700, marginBottom: 6 }}>{s.label}</div>
                <div style={{ color: C.sub, fontSize: 12, lineHeight: 1.55 }}>{s.desc}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Tech cards ─────────────────────────────────────────────────────── */}
        <section style={{ marginBottom: 72 }}>
          <SectionLabel>{T.landing.sectionTech}</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
            {T.landing.techCards.map(card => (
              <Card key={card.title}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <span style={{ fontSize: 18, color: 'rgba(255,45,120,.7)' }}>{card.icon}</span>
                  <span style={{
                    padding: '2px 8px', borderRadius: 20,
                    background: 'rgba(255,45,120,.08)', color: 'rgba(255,45,120,.55)',
                    fontSize: 10, fontWeight: 700, letterSpacing: '.04em',
                  }}>{card.tag}</span>
                </div>
                <div style={{ color: C.text, fontSize: 14, fontWeight: 600, marginBottom: 6 }}>{card.title}</div>
                <div style={{ color: C.sub, fontSize: 13, lineHeight: 1.6 }}>{card.desc}</div>
              </Card>
            ))}
          </div>
        </section>

        {/* ── Tech stack ─────────────────────────────────────────────────────── */}
        <section>
          <SectionLabel>{T.landing.sectionStack}</SectionLabel>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
            {T.landing.stackRows.map(([mod, choice, reason], i) => (
              <div key={mod} style={{
                display: 'grid', gridTemplateColumns: '70px 1fr 1fr',
                padding: '13px 18px',
                borderBottom: i < T.landing.stackRows.length - 1 ? `1px solid ${C.border}` : 'none',
                gap: 16, alignItems: 'center',
              }}>
                <span style={{ color: C.primary, fontSize: 12, fontWeight: 700 }}>{mod}</span>
                <span style={{ color: C.text, fontSize: 12 }}>{choice}</span>
                <span style={{ color: C.sub, fontSize: 12 }}>{reason}</span>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer style={{
        borderTop: `1px solid ${C.border}`, padding: '20px 40px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        position: 'relative', zIndex: 1,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.primary, display: 'inline-block' }}/>
          <span style={{ color: C.sub, fontSize: 12 }}>{T.landing.footerSpan}</span>
        </div>
        <span style={{ color: 'rgba(255,255,255,.15)', fontSize: 12 }}>{T.landing.footerHint}</span>
      </footer>

      {/* ── oiioii Muse Pet ────────────────────────────────────────────────── */}
      <Fairy />
    </div>
    </PasswordGate>
  );
}
