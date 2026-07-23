'use client';

import { useEffect, useState } from 'react';

const POLL_MS = 30_000;

const usd = (n) =>
  n == null ? '—' : n < 10 ? `$${n.toFixed(2)}` : `$${Math.round(n).toLocaleString('pt-BR')}`;

/** Countdown formatado a partir do resetsAt — o relógio corre no cliente. */
function remaining(resetsAt, now) {
  const ms = new Date(resetsAt).getTime() - now;
  if (ms <= 0) return null;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return { h, m, s, ms, text: h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m ${String(s).padStart(2, '0')}s` };
}

function tone(fill) {
  if (fill == null) return 'var(--accent)';
  if (fill >= 0.85) return 'var(--hot)';
  if (fill >= 0.6) return 'var(--warn)';
  return 'var(--ok)';
}

function Account({ acc, now }) {
  const w = acc.window;
  const left = w ? remaining(w.resetsAt, now) : null;
  const color = left ? tone(w.fillRatio) : 'var(--ok)';

  return (
    <section className="card">
      <div className="acct">
        <span className="dot" style={{ background: color }} />
        {acc.account}
      </div>

      {left ? (
        <>
          <p className="count" style={{ color }}>{left.text}</p>
          <div className="count-label">
            até liberar &middot; reset às{' '}
            {new Date(w.resetsAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </div>
          {w.fillRatio != null && (
            <div className="bar">
              <i style={{ width: `${Math.round(w.fillRatio * 100)}%`, background: color }} />
            </div>
          )}
        </>
      ) : (
        <>
          <p className="count free">disponível</p>
          <div className="count-label">nenhuma janela ativa — pode usar à vontade</div>
        </>
      )}

      <div className="stats">
        <div className="stat">
          <div className="k">Nesta janela</div>
          <div className="v">{w ? usd(w.usd) : '—'}</div>
        </div>
        <div className="stat">
          <div className="k">Hoje</div>
          <div className="v">{usd(acc.dayUsd)}</div>
        </div>
        <div className="stat">
          <div className="k">7 dias</div>
          <div className="v">{usd(acc.weekUsd)}</div>
        </div>
      </div>

      {acc.byModel?.length > 0 && (
        <div className="models">
          {acc.byModel.slice(0, 4).map((m) => (
            <span className="chip" key={m.label}>{m.label} · {usd(m.usd)}</span>
          ))}
        </div>
      )}
    </section>
  );
}

export default function Page() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [now, setNow] = useState(() => Date.now());

  // Relógio local: o countdown roda sozinho, sem custo de rede.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch('/api/status', { cache: 'no-store' });
        const j = await r.json();
        if (!alive) return;
        if (!r.ok) throw new Error(j.detail || j.error || `HTTP ${r.status}`);
        setData(j);
        setError(null);
      } catch (e) {
        if (alive) setError(String(e.message ?? e));
      }
    };
    load();
    const t = setInterval(load, POLL_MS);
    // Voltar pro app depois de um tempo deve atualizar na hora.
    const onVis = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      alive = false;
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  const accounts = data?.accounts ?? [];

  return (
    <main className="wrap">
      <header className="top">
        <h1>Claude Meter</h1>
        {data && (
          <span className="stamp">
            atualizado {new Date(data.generatedAt).toLocaleTimeString('pt-BR')}
          </span>
        )}
      </header>

      {error && <div className="err">{error}</div>}

      {!data && !error && <div className="empty">carregando…</div>}

      {data && accounts.length === 0 && (
        <div className="empty">
          Nenhum evento recebido ainda.
          <br />
          O hook envia os dados no próximo prompt do Claude Code.
        </div>
      )}

      <div className="grid">
        {accounts.map((acc) => (
          <Account key={acc.account} acc={acc} now={now} />
        ))}
      </div>

      {accounts.length > 0 && (
        <p className="note">
          Valores são <strong>custo equivalente em API</strong> — quanto esse uso custaria pago por
          token. No plano Pro você paga assinatura fixa, então não é gasto real; serve para comparar
          as contas e medir o valor extraído. O horário de reset é derivado dos timestamps da janela
          de 5h, e a barra compara a janela atual com a sua média histórica (a Anthropic não publica
          o limite exato do Pro).
        </p>
      )}
    </main>
  );
}
