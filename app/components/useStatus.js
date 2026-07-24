'use client';

import { useEffect, useState } from 'react';

const POLL_MS = 30_000;

/**
 * Fonte única do estado para todas as telas.
 *
 * `now` avança de segundo em segundo no cliente para o countdown correr sem
 * custo de rede; os dados em si só são rebuscados a cada 30s e ao voltar
 * para o app.
 */
export function useStatus() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [now, setNow] = useState(() => Date.now());

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
    const onVis = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      alive = false;
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  return { data, error, now };
}

/* ---------- formatação compartilhada ---------- */

export const usd = (n) =>
  n == null
    ? '—'
    : n < 10
      ? `$${n.toFixed(2)}`
      : `$${Math.round(n).toLocaleString('pt-BR')}`;

export const compact = (n) => {
  if (n == null) return '—';
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(n);
};

export const pct = (n) => (n == null ? '—' : `${Math.round(n * 100)}%`);

export function remaining(resetsAt, now) {
  const ms = new Date(resetsAt).getTime() - now;
  if (ms <= 0) return null;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return {
    ms,
    text: h > 0 ? `${h}:${String(m).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`,
    unit: h > 0 ? 'horas' : 'min',
  };
}

export const toneOf = (level) =>
  ({ free: 'var(--ok)', ok: 'var(--ok)', warn: 'var(--warn)', danger: 'var(--danger)' })[level] ??
  'var(--accent)';

export function Loading() {
  return (
    <div className="empty">
      <div className="brand-loader" />
      <p style={{ marginTop: 16 }}>carregando</p>
    </div>
  );
}
