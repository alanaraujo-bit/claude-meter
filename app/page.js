'use client';

import { TriangleAlert, CircleCheck, Info, Zap, CalendarClock } from 'lucide-react';
import { useStatus, usd, compact, remaining, toneOf, Loading } from './components/useStatus.js';

const ageText = (ms) => {
  const min = Math.round(ms / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  return `há ${Math.floor(min / 60)}h`;
};

function AccountCard({ acc, insight, now }) {
  const left = insight?.resetsAt ? remaining(insight.resetsAt, now) : null;
  const color = toneOf(insight?.level ?? 'ok');
  const pct = insight?.pct;
  const weekly = insight?.weekly;
  const burn = insight?.burn;
  const estimado = insight?.source === 'estimado';

  return (
    <section className="card glass-panel fade-up">
      <div className="acct-line">
        <span className="dot" style={{ background: color }} />
        <span className="acct-name">{acc.account}</span>
        {estimado && <span className="pill">estimado</span>}
      </div>

      {left ? (
        <>
          <p className="count mono" style={{ color }}>
            {left.text}
            <span style={{ fontSize: '0.32em', marginLeft: 8, letterSpacing: 0 }}>{left.unit}</span>
          </p>
          <div className="count-sub">
            libera às{' '}
            {new Date(insight.resetsAt).toLocaleTimeString('pt-BR', {
              hour: '2-digit',
              minute: '2-digit',
            })}
            {pct != null && ` · ${pct}% da janela`}
          </div>
          {pct != null && (
            <div className="track">
              <i style={{ width: `${Math.min(pct, 100)}%`, background: color }} />
            </div>
          )}
          {insight?.ageMs != null && (
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>
              percentual medido {ageText(insight.ageMs)} · o horário de reset é exato
            </div>
          )}
        </>
      ) : (
        <>
          <p className="count free">Disponível</p>
          <div className="count-sub">janela de 5h zerada — pode usar à vontade</div>
        </>
      )}

      {weekly?.pct != null && (
        <div style={{ marginTop: 18 }}>
          <div className="split-row" style={{ fontSize: 12 }}>
            <span style={{ color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <CalendarClock size={13} aria-hidden="true" /> Limite semanal
            </span>
            <span className="mono" style={{ fontSize: 12 }}>
              {weekly.pct}%
            </span>
          </div>
          <div className="split-bar" style={{ marginTop: 6 }}>
            <i
              style={{
                width: `${Math.min(weekly.pct, 100)}%`,
                background: weekly.pct >= 90 ? 'var(--danger)' : weekly.pct >= 70 ? 'var(--warn)' : 'var(--accent)',
              }}
            />
          </div>
        </div>
      )}

      <div className="metrics">
        <div className="metric">
          <div className="k">Janela</div>
          <div className="v mono">{acc.window ? usd(acc.window.usd) : '—'}</div>
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
  const semOficial = accounts.length > 0 && per.every((p) => p.source !== 'oficial');

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

        {semOficial && (
          <div className="insight warn">
            <TriangleAlert size={18} className="ic" aria-hidden="true" />
            <span>
              Ainda sem o limite oficial do plano — os valores abaixo são{' '}
              <strong>estimados</strong> e podem errar em dezenas de minutos. O próximo prompt no
              Claude Code traz o número real.
            </span>
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
            O countdown e o percentual vêm do <strong>limite oficial do plano</strong>, lido do
            cache do próprio Claude Code — são os mesmos números do painel de Uso. Já os valores em
            dólar são <strong>custo equivalente em API</strong>, calculados aqui: quanto o uso
            custaria pago por token. No Pro você paga assinatura fixa, então não é gasto real.
          </p>
        </>
      )}
    </div>
  );
}
