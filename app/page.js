'use client';

import { ArrowRight, TriangleAlert, CircleCheck, Info, Zap } from 'lucide-react';
import { useStatus, usd, compact, remaining, toneOf, Loading } from './components/useStatus.js';

function AccountCard({ acc, insight, now }) {
  const w = acc.window;
  const left = w ? remaining(w.resetsAt, now) : null;
  const color = toneOf(insight?.level ?? 'ok');
  const burn = insight?.burn;

  return (
    <section className="card glass-panel fade-up">
      <div className="acct-line">
        <span className="dot" style={{ background: color }} />
        <span className="acct-name">{acc.account}</span>
      </div>

      {left ? (
        <>
          <p className="count mono" style={{ color }}>
            {left.text}
            <span style={{ fontSize: '0.32em', marginLeft: 8, letterSpacing: 0 }}>{left.unit}</span>
          </p>
          <div className="count-sub">
            libera às{' '}
            {new Date(w.resetsAt).toLocaleTimeString('pt-BR', {
              hour: '2-digit',
              minute: '2-digit',
            })}
            {insight?.headline ? ` · ${insight.headline}` : ''}
          </div>
          {w.fillRatio != null && (
            <div className="track">
              <i style={{ width: `${Math.round(w.fillRatio * 100)}%`, background: color }} />
            </div>
          )}
        </>
      ) : (
        <>
          <p className="count free">Disponível</p>
          <div className="count-sub">nenhuma janela ativa — pode usar à vontade</div>
        </>
      )}

      <div className="metrics">
        <div className="metric">
          <div className="k">Janela</div>
          <div className="v mono">{w ? usd(w.usd) : '—'}</div>
        </div>
        <div className="metric">
          <div className="k">Ritmo</div>
          <div className="v mono">{burn?.usdPerHour ? `${burn.usdPerHour.toFixed(2)}/h` : '—'}</div>
        </div>
        <div className="metric">
          <div className="k">Hoje</div>
          <div className="v mono">{usd(acc.dayUsd)}</div>
        </div>
      </div>

      {insight?.detail && (
        <p style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.55, marginTop: 14, marginBottom: 0 }}>
          {insight.detail}
        </p>
      )}
    </section>
  );
}

export default function Page() {
  const { data, error, now } = useStatus();
  const accounts = data?.accounts ?? [];
  const per = data?.insights?.per ?? [];
  const rec = data?.insights?.recommendation;
  const byAcc = new Map(per.map((p) => [p.account, p]));

  const RecIcon = rec?.level === 'good' ? CircleCheck : rec?.level === 'danger' ? TriangleAlert : Info;

  return (
    <div className="page">
      <header className="page-head">
        <h1>Visão geral</h1>
        <p>
          {data
            ? `Atualizado às ${new Date(data.generatedAt).toLocaleTimeString('pt-BR')}`
            : 'Carregando estado das contas'}
        </p>
      </header>

      {error && <div className="err">{error}</div>}
      {!data && !error && <Loading />}

      {data && accounts.length === 0 && (
        <div className="empty">
          Nenhum evento recebido ainda.
          <br />
          O hook envia os dados no próximo prompt do Claude Code.
        </div>
      )}

      <div className="stack">
        {rec && (
          <div className={`insight ${rec.level} fade-up`}>
            <RecIcon size={18} className="ic" aria-hidden="true" />
            <span>{rec.text}</span>
          </div>
        )}

        {accounts.map((acc) => (
          <AccountCard key={acc.account} acc={acc} insight={byAcc.get(acc.account)} now={now} />
        ))}
      </div>

      {accounts.length > 0 && (
        <>
          <div className="tiles" style={{ marginTop: 14 }}>
            <div className="tile glass-panel">
              <div className="k">Hoje</div>
              <div className="v mono">{usd(data.totals.dayUsd)}</div>
              <div className="s">todas as contas</div>
            </div>
            <div className="tile glass-panel">
              <div className="k">7 dias</div>
              <div className="v mono">{usd(data.totals.weekUsd)}</div>
              <div className="s">equivalente API</div>
            </div>
            <div className="tile glass-panel">
              <div className="k">Mensagens</div>
              <div className="v mono">{compact(data.totals.messages)}</div>
              <div className="s">últimos {accounts[0]?.periodDays ?? 15} dias</div>
            </div>
            <div className="tile glass-panel">
              <div className="k">Tokens</div>
              <div className="v mono">{compact(data.totals.tokens)}</div>
              <div className="s">entrada + saída + cache</div>
            </div>
          </div>

          <p className="note">
            <Zap size={12} style={{ verticalAlign: -1, marginRight: 4 }} aria-hidden="true" />
            Valores são <strong>custo equivalente em API</strong> — quanto o uso custaria pago por
            token. No Pro você paga assinatura fixa, então não é gasto real: serve para comparar as
            contas e medir o valor extraído. A barra compara a janela atual com a sua média
            histórica, porque a Anthropic não publica o limite exato do plano.
          </p>
        </>
      )}
    </div>
  );
}
