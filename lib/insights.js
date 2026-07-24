import { WINDOW_MS } from './windows.js';

/**
 * A camada "inteligente": transforma números em uma recomendação acionável.
 *
 * A pergunta real nunca é "quantos dólares gastei" — é "posso continuar aqui,
 * ou já troco de conta?".
 *
 * Fonte de verdade: `acc.limits`, copiado do cache oficial do Claude Code.
 * A janela derivada dos timestamps ficou como fallback porque errava de forma
 * sistemática — ela assume que a janela começou no primeiro evento observado,
 * mas a coleta quase sempre começa no meio de uma janela em andamento.
 */

const MIN_SAMPLE_MS = 6 * 60 * 1000; // abaixo disso o ritmo é ruído, não tendência
const WARN_PCT = 70;
const DANGER_PCT = 90;

export const fmtDur = (ms) => {
  const min = Math.max(0, Math.round(ms / 60000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}min` : `${h}h`;
};

/** Ritmo de consumo em USD/h dentro da janela atual. */
export function burnOf(acc, now = Date.now()) {
  const w = acc.window;
  if (!w) return null;
  const elapsedMs = now - new Date(w.startedAt).getTime();
  if (elapsedMs < MIN_SAMPLE_MS) return { usdPerHour: null, elapsedMs, reliable: false };
  return { usdPerHour: (w.usd / elapsedMs) * 3_600_000, elapsedMs, reliable: true };
}

/**
 * Estado da janela de 5h. Prefere o dado oficial; só cai para a estimativa
 * quando o hook ainda não capturou nenhum snapshot daquela conta.
 */
function windowState(acc, now) {
  const off = acc.limits?.fiveHour;
  if (off?.resetsAt) {
    const resetMs = new Date(off.resetsAt).getTime();
    const fetchedMs = acc.limits.fetchedAt ? new Date(acc.limits.fetchedAt).getTime() : null;
    return {
      source: 'oficial',
      pct: off.pct,
      resetsAt: off.resetsAt,
      msToReset: resetMs - now,
      // Quanto tempo faz que o percentual foi medido. O reset é absoluto e não
      // envelhece; a porcentagem, sim.
      ageMs: fetchedMs != null ? now - fetchedMs : null,
      expired: resetMs <= now,
    };
  }

  const w = acc.window;
  if (!w) return null;
  const resetMs = new Date(w.resetsAt).getTime();
  return {
    source: 'estimado',
    pct: w.fillRatio != null ? Math.round(w.fillRatio * 100) : null,
    resetsAt: w.resetsAt,
    msToReset: resetMs - now,
    ageMs: null,
    expired: resetMs <= now,
  };
}

function levelFor(pct) {
  if (pct == null) return 'ok';
  if (pct >= DANGER_PCT) return 'danger';
  if (pct >= WARN_PCT) return 'warn';
  return 'ok';
}

export function insightsFor(summary, now = Date.now()) {
  const accounts = summary.accounts ?? [];

  const per = accounts.map((acc) => {
    const st = windowState(acc, now);
    const burn = burnOf(acc, now);
    const weekly = acc.limits?.sevenDay ?? null;

    if (!st || st.expired) {
      return {
        account: acc.account,
        level: 'free',
        headline: 'Disponível',
        detail: 'Janela de 5h zerada. Usar agora abre uma janela nova.',
        pct: null,
        source: st?.source ?? null,
        ageMs: st?.ageMs ?? null,
        resetsAt: null,
        weekly,
        burn,
      };
    }

    const level = levelFor(st.pct);
    const resetTxt = fmtDur(st.msToReset);
    const stale = st.ageMs != null && st.ageMs > 10 * 60 * 1000;

    let detail;
    if (st.pct == null) {
      detail = `Reset em ${resetTxt}.`;
    } else if (level === 'danger') {
      detail = `No limite da janela. Libera em ${resetTxt}.`;
    } else if (level === 'warn') {
      detail = `Sobra pouco nesta janela. Libera em ${resetTxt}.`;
    } else {
      detail = burn?.reliable
        ? `Ritmo de ${burn.usdPerHour.toFixed(2)}/h. Libera em ${resetTxt}.`
        : `Libera em ${resetTxt}.`;
    }
    if (stale) detail += ` Percentual medido há ${fmtDur(st.ageMs)}.`;

    // O limite semanal pode estrangular antes da janela de 5h — se estiver
    // alto, ele vira o assunto principal, porque nenhuma troca de conta resolve.
    if (weekly?.pct >= WARN_PCT) {
      detail += ` Semanal em ${weekly.pct}%.`;
    }

    return {
      account: acc.account,
      level: weekly?.pct >= DANGER_PCT ? 'danger' : level,
      headline: st.pct != null ? `${st.pct}% usado` : 'Janela ativa',
      detail,
      pct: st.pct,
      source: st.source,
      ageMs: st.ageMs,
      resetsAt: st.resetsAt,
      weekly,
      burn,
    };
  });

  // Recomendação: livre ganha; senão, o menor percentual; empate desempata
  // por quem reseta primeiro.
  const rank = { free: 0, ok: 1, warn: 2, danger: 3 };
  const best = [...per].sort((a, b) => {
    const d = rank[a.level] - rank[b.level];
    if (d !== 0) return d;
    const pa = a.pct ?? 0;
    const pb = b.pct ?? 0;
    if (pa !== pb) return pa - pb;
    return new Date(a.resetsAt ?? 0) - new Date(b.resetsAt ?? 0);
  })[0];

  let recommendation = null;
  if (per.length > 1 && best) {
    const pressured = per.filter((p) => p.level === 'warn' || p.level === 'danger');
    if (pressured.length === per.length) {
      const soonest = [...per]
        .filter((p) => p.resetsAt)
        .sort((a, b) => new Date(a.resetsAt) - new Date(b.resetsAt))[0];
      recommendation = soonest
        ? {
            level: 'danger',
            text: `As duas contas estão no limite. A primeira a liberar é ${soonest.account}, em ${fmtDur(
              new Date(soonest.resetsAt).getTime() - now
            )}.`,
            account: soonest.account,
          }
        : null;
    } else if (pressured.length > 0) {
      recommendation = {
        level: best.level === 'free' ? 'good' : 'warn',
        text:
          best.level === 'free'
            ? `Troque para ${best.account} — janela zerada.`
            : `Troque para ${best.account} — está em ${best.pct}%.`,
        account: best.account,
      };
    }
  }

  return { per, recommendation };
}

export { WINDOW_MS };
