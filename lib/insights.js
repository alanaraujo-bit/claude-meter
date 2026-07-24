import { WINDOW_MS } from './windows.js';

/**
 * A camada "inteligente": transforma números crus em uma recomendação acionável.
 *
 * A pergunta real do usuário nunca é "quantos dólares gastei" — é
 * "posso continuar aqui, ou já troco de conta?". Tudo abaixo existe para
 * responder isso em uma frase.
 */

const MIN_SAMPLE_MS = 6 * 60 * 1000; // abaixo disso o ritmo é ruído, não tendência

/**
 * Ritmo de consumo da janela atual, em USD/hora, e projeção de quando o gasto
 * alcança a média histórica de janela.
 *
 * Importante: isto NÃO é o limite real do plano Pro — a Anthropic não publica
 * esse número. É a sua própria média que serve de régua, o que na prática
 * responde "esta janela está mais pesada que o seu normal?".
 */
export function burnOf(acc, now = Date.now()) {
  const w = acc.window;
  if (!w) return null;

  const elapsedMs = now - new Date(w.startedAt).getTime();
  const msToReset = new Date(w.resetsAt).getTime() - now;
  if (elapsedMs < MIN_SAMPLE_MS) {
    return { usdPerHour: null, msToTypical: null, elapsedMs, msToReset, reliable: false };
  }

  const usdPerHour = (w.usd / elapsedMs) * 3_600_000;
  const typical = acc.typicalWindowUsd;

  let msToTypical = null;
  if (typical && usdPerHour > 0 && w.usd < typical) {
    msToTypical = ((typical - w.usd) / usdPerHour) * 3_600_000;
    // Só interessa se estourar ANTES do reset — depois disso a janela zera sozinha.
    if (msToTypical > msToReset) msToTypical = null;
  }

  return { usdPerHour, msToTypical, elapsedMs, msToReset, reliable: true };
}

const fmtDur = (ms) => {
  const min = Math.max(0, Math.round(ms / 60000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}min` : `${h}h`;
};

/**
 * Uma frase por conta + a recomendação global de para onde ir.
 * `level` alimenta tanto a cor do card quanto o disparo de push.
 */
export function insightsFor(summary, now = Date.now()) {
  const accounts = summary.accounts ?? [];
  const per = accounts.map((acc) => {
    const w = acc.window;
    const burn = burnOf(acc, now);
    const fill = w?.fillRatio ?? null;

    if (!w) {
      return {
        account: acc.account,
        level: 'free',
        headline: 'Disponível',
        detail: 'Nenhuma janela ativa. Começar a usar abre uma janela nova de 5h.',
        burn,
        freeAt: null,
      };
    }

    const resetTxt = fmtDur(burn?.msToReset ?? 0);

    if (fill != null && fill >= 0.9) {
      return {
        account: acc.account,
        level: 'danger',
        headline: `${Math.round(fill * 100)}% da sua média`,
        detail: burn?.msToTypical
          ? `No ritmo atual você passa da sua média em ~${fmtDur(burn.msToTypical)}. Reset em ${resetTxt}.`
          : `Esta janela já está entre as suas mais pesadas. Reset em ${resetTxt}.`,
        burn,
        freeAt: w.resetsAt,
      };
    }

    if (fill != null && fill >= 0.65) {
      return {
        account: acc.account,
        level: 'warn',
        headline: `${Math.round(fill * 100)}% da sua média`,
        detail: burn?.msToTypical
          ? `Ritmo de ${burn.usdPerHour.toFixed(2)}/h — alcança sua média em ~${fmtDur(burn.msToTypical)}.`
          : `Reset em ${resetTxt}.`,
        burn,
        freeAt: w.resetsAt,
      };
    }

    return {
      account: acc.account,
      level: 'ok',
      headline: 'Folga',
      detail: burn?.reliable
        ? `Ritmo de ${burn.usdPerHour.toFixed(2)}/h. Reset em ${resetTxt}.`
        : `Reset em ${resetTxt}.`,
      burn,
      freeAt: w.resetsAt,
    };
  });

  // Recomendação: conta livre ganha; senão, a mais folgada; empate desempata
  // por quem reseta primeiro.
  const rank = { free: 0, ok: 1, warn: 2, danger: 3 };
  const best = [...per].sort((a, b) => {
    const d = rank[a.level] - rank[b.level];
    if (d !== 0) return d;
    const fa = a.freeAt ? new Date(a.freeAt).getTime() : 0;
    const fb = b.freeAt ? new Date(b.freeAt).getTime() : 0;
    return fa - fb;
  })[0];

  let recommendation = null;
  if (per.length > 1 && best) {
    const pressured = per.filter((p) => p.level === 'warn' || p.level === 'danger');
    if (pressured.length && (best.level === 'free' || best.level === 'ok')) {
      recommendation = {
        level: best.level === 'free' ? 'good' : 'warn',
        text:
          best.level === 'free'
            ? `Troque para ${best.account} — está sem janela ativa.`
            : `${best.account} está mais folgada agora.`,
        account: best.account,
      };
    } else if (pressured.length === per.length) {
      const soonest = [...per].sort(
        (a, b) => new Date(a.freeAt ?? 0) - new Date(b.freeAt ?? 0)
      )[0];
      recommendation = {
        level: 'danger',
        text: `As duas contas estão pesadas. A primeira a liberar é ${soonest.account}, em ${fmtDur(
          new Date(soonest.freeAt).getTime() - now
        )}.`,
        account: soonest.account,
      };
    }
  }

  return { per, recommendation };
}

export { fmtDur, WINDOW_MS };
