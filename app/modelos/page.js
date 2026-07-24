'use client';

import { useStatus, usd, compact, Loading } from '../components/useStatus.js';

// Mesma tabela de lib/pricing.js, só para exibição. Mantida aqui em vez de
// importada porque a página é client-side e não precisa da lógica de cálculo.
const TABELA = [
  { label: 'Fable 5', input: 10, output: 50 },
  { label: 'Opus 4.8', input: 5, output: 25 },
  { label: 'Sonnet 5', input: 3, output: 15, nota: 'promocional $2/$10 até 01/09/2026' },
  { label: 'Sonnet 4.6', input: 3, output: 15 },
  { label: 'Haiku 4.5', input: 1, output: 5 },
];

export default function Modelos() {
  const { data, error } = useStatus();
  const accounts = data?.accounts ?? [];

  // Consolida os modelos de todas as contas para o ranking geral.
  const geral = new Map();
  for (const acc of accounts) {
    for (const m of acc.byModel) {
      const cur = geral.get(m.label) ?? { label: m.label, usd: 0, messages: 0, tokens: 0 };
      cur.usd += m.usd;
      cur.messages += m.messages;
      cur.tokens += m.tokens;
      geral.set(m.label, cur);
    }
  }
  const ranking = [...geral.values()].sort((a, b) => b.usd - a.usd);
  const maxUsd = ranking[0]?.usd || 1;
  const totalUsd = ranking.reduce((s, m) => s + m.usd, 0) || 1;

  return (
    <div className="page">
      <header className="page-head">
        <h1>Modelos</h1>
        <p>Onde o custo equivalente está concentrado, e o preço de cada tabela.</p>
      </header>

      {error && <div className="err">{error}</div>}
      {!data && !error && <Loading />}
      {data && ranking.length === 0 && <div className="empty">Sem dados ainda.</div>}

      {ranking.length > 0 && (
        <div className="stack">
          <section className="card glass-panel fade-up">
            <strong style={{ fontSize: 13 }}>Consumo por modelo</strong>
            <div className="split">
              {ranking.map((m) => (
                <div key={m.label}>
                  <div className="split-row">
                    <span>{m.label}</span>
                    <span className="mono" style={{ fontSize: 12 }}>
                      {usd(m.usd)} · {Math.round((m.usd / totalUsd) * 100)}%
                    </span>
                  </div>
                  <div className="split-bar">
                    <i style={{ width: `${(m.usd / maxUsd) * 100}%` }} />
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>
                    {compact(m.messages)} mensagens · {compact(m.tokens)} tokens
                  </div>
                </div>
              ))}
            </div>
          </section>

          {accounts.length > 1 &&
            accounts.map((acc) => (
              <section key={acc.account} className="card glass-panel">
                <div className="acct-line">
                  <span className="acct-name">{acc.account}</span>
                </div>
                <div className="legend" style={{ marginTop: 0 }}>
                  {acc.byModel.length === 0 ? (
                    <span className="pill">sem uso no período</span>
                  ) : (
                    acc.byModel.map((m) => (
                      <span className="pill" key={m.label}>
                        {m.label} · {usd(m.usd)}
                      </span>
                    ))
                  )}
                </div>
              </section>
            ))}

          <section className="card glass-panel">
            <strong style={{ fontSize: 13 }}>Tabela de preços (USD por 1M tokens)</strong>
            <div className="split" style={{ marginTop: 12 }}>
              {TABELA.map((m) => (
                <div key={m.label} className="split-row" style={{ alignItems: 'start' }}>
                  <div>
                    <div>{m.label}</div>
                    {m.nota && (
                      <div style={{ fontSize: 11, color: 'var(--warn)', marginTop: 2 }}>{m.nota}</div>
                    )}
                  </div>
                  <span className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>
                    ${m.input} / ${m.output}
                  </span>
                </div>
              ))}
            </div>
            <p className="note" style={{ marginTop: 16 }}>
              Cache tem preço próprio derivado da entrada: <strong>leitura 10%</strong>,{' '}
              <strong>escrita 125%</strong> (TTL de 5 min) ou <strong>200%</strong> (TTL de 1 hora).
              É por isso que somar tudo como &quot;entrada&quot; infla a conta em ordens de grandeza.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
