'use client';

import { useState } from 'react';
import { useStatus, usd, compact, pct, Loading } from '../components/useStatus.js';

function Bars({ series, keyName, labelOf }) {
  const max = Math.max(...series.map((b) => b.usd), 0.0001);
  return (
    <>
      <div className="bars" role="img" aria-label="Consumo ao longo do tempo">
        {series.map((b, i) => (
          <i
            key={b[keyName] ?? i}
            className={b.usd > 0 ? 'hot' : ''}
            style={{ height: `${Math.max((b.usd / max) * 100, b.usd > 0 ? 4 : 1)}%` }}
            title={`${labelOf(b)} · ${usd(b.usd)}`}
          />
        ))}
      </div>
      <div className="axis">
        <span>{labelOf(series[0])}</span>
        <span>{labelOf(series[series.length - 1])}</span>
      </div>
    </>
  );
}

const hourLabel = (b) =>
  b ? new Date(b.startMs).toLocaleTimeString('pt-BR', { hour: '2-digit' }) + 'h' : '';
const dayLabel = (b) =>
  b ? new Date(b.dayMs).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '';

export default function Estatisticas() {
  const { data, error } = useStatus();
  const [range, setRange] = useState('24h');
  const accounts = data?.accounts ?? [];

  return (
    <div className="page">
      <header className="page-head">
        <h1>Estatísticas</h1>
        <p>Consumo ao longo do tempo, eficiência de cache e onde o token está indo.</p>
      </header>

      {error && <div className="err">{error}</div>}
      {!data && !error && <Loading />}
      {data && accounts.length === 0 && <div className="empty">Sem dados ainda.</div>}

      {accounts.length > 0 && (
        <div className="stack">
          <div className="row" style={{ gap: 8 }}>
            {['24h', '14d'].map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`btn btn-sm ${range === r ? 'glass-button-accent' : 'glass-button'}`}
              >
                {r === '24h' ? '24 horas' : '14 dias'}
              </button>
            ))}
          </div>

          {accounts.map((acc) => {
            const series = range === '24h' ? acc.hourly : acc.daily;
            const t = acc.tokens;
            const totalIO = t.input + t.output + t.write + t.read || 1;
            const parts = [
              { label: 'Cache lido', v: t.read, hint: '10% do preço de entrada' },
              { label: 'Cache escrito', v: t.write, hint: '125% (5m) ou 200% (1h)' },
              { label: 'Saída', v: t.output, hint: 'o token mais caro' },
              { label: 'Entrada', v: t.input, hint: 'preço cheio de entrada' },
            ];

            return (
              <section key={acc.account} className="card glass-panel fade-up">
                <div className="between" style={{ marginBottom: 4 }}>
                  <span className="acct-name">{acc.account}</span>
                  <span className="pill accent">{usd(acc.totalUsd)}</span>
                </div>

                <Bars
                  series={series}
                  keyName={range === '24h' ? 'startMs' : 'dayMs'}
                  labelOf={range === '24h' ? hourLabel : dayLabel}
                />

                <div className="metrics">
                  <div className="metric">
                    <div className="k">Janelas</div>
                    <div className="v mono">{acc.windowsCount}</div>
                  </div>
                  <div className="metric">
                    <div className="k">Média/janela</div>
                    <div className="v mono">{usd(acc.typicalWindowUsd)}</div>
                  </div>
                  <div className="metric">
                    <div className="k">Pico</div>
                    <div className="v mono">{usd(acc.peakWindowUsd)}</div>
                  </div>
                </div>

                <div className="split">
                  <div className="between" style={{ marginTop: 4 }}>
                    <strong style={{ fontSize: 13 }}>Composição dos tokens</strong>
                    <span className="pill">cache {pct(acc.cacheHitRatio)}</span>
                  </div>
                  {parts.map((p) => (
                    <div key={p.label}>
                      <div className="split-row">
                        <span style={{ color: 'var(--muted)' }}>{p.label}</span>
                        <span className="mono" style={{ fontSize: 12 }}>
                          {compact(p.v)}
                        </span>
                      </div>
                      <div className="split-bar">
                        <i style={{ width: `${(p.v / totalIO) * 100}%` }} />
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>{p.hint}</div>
                    </div>
                  ))}
                </div>

                {acc.byProject?.length > 0 && (
                  <>
                    <strong style={{ fontSize: 13, display: 'block', marginTop: 20 }}>
                      Projetos que mais consomem
                    </strong>
                    <div className="legend">
                      {acc.byProject.slice(0, 6).map((p) => (
                        <span className="pill" key={p.project}>
                          {p.project.replace(/^c--Users-[^-]+-/i, '').slice(0, 28)} · {usd(p.usd)}
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </section>
            );
          })}

          <p className="note">
            A proporção de <strong>cache lido</strong> é a métrica de eficiência mais útil aqui:
            token servido de cache custa 10% do preço de entrada. Quanto maior essa fatia, mais
            barato sai cada turno — conversas longas em um mesmo contexto puxam esse número para
            cima.
          </p>
        </div>
      )}
    </div>
  );
}
