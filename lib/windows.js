import { costOf, resolveModel, MODELS } from './pricing.js';

// A janela de sessão do plano Pro dura 5h e começa na primeira mensagem depois
// que a janela anterior expirou. A Anthropic não expõe o horário do reset em
// lugar nenhum — nem em header, nem em cache local — então derivamos dos
// próprios timestamps. É exato ao minuto enquanto os eventos estiverem completos.
export const WINDOW_MS = 5 * 60 * 60 * 1000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Agrupa eventos ordenados de UMA conta em janelas de 5h. */
export function windowsOf(events) {
  const out = [];
  let cur = null;
  for (const e of events) {
    const t = new Date(e.ts).getTime();
    if (!cur || t >= cur.endMs) {
      cur = { startMs: t, endMs: t + WINDOW_MS, usd: 0, tokens: 0, messages: 0 };
      out.push(cur);
    }
    cur.messages++;
    cur.usd += costOf(e);
    cur.tokens +=
      Number(e.input_tokens || 0) +
      Number(e.output_tokens || 0) +
      Number(e.cache_write_5m || 0) +
      Number(e.cache_write_1h || 0) +
      Number(e.cache_read || 0);
  }
  return out;
}

/**
 * Estado por conta. `msToReset` é o número que o Alan quer ver:
 * quanto falta pra janela de 5h liberar.
 */
export function summarize(events, now = Date.now()) {
  const byAccount = new Map();
  for (const e of events) {
    if (!byAccount.has(e.account)) byAccount.set(e.account, []);
    byAccount.get(e.account).push(e);
  }

  const accounts = [];
  for (const [account, list] of byAccount) {
    list.sort((a, b) => new Date(a.ts) - new Date(b.ts));
    const wins = windowsOf(list);
    const last = wins[wins.length - 1];
    const active = last && now < last.endMs ? last : null;

    // Média histórica de gasto por janela — a referência pra saber se a janela
    // atual está "cheia". É o melhor proxy possível: a Anthropic não publica
    // o limite exato do Pro em tokens.
    const closed = wins.filter((w) => w.endMs <= now);
    const typicalUsd = closed.length
      ? closed.reduce((s, w) => s + w.usd, 0) / closed.length
      : null;

    const byModel = {};
    for (const e of list) {
      const key = resolveModel(e.model);
      if (!key) continue;
      byModel[key] ??= { label: MODELS[key].label, usd: 0, messages: 0 };
      byModel[key].usd += costOf(e);
      byModel[key].messages++;
    }

    const sum = (since) =>
      list
        .filter((e) => new Date(e.ts).getTime() >= since)
        .reduce((s, e) => s + costOf(e), 0);

    accounts.push({
      account,
      totalUsd: list.reduce((s, e) => s + costOf(e), 0),
      dayUsd: sum(now - DAY_MS),
      weekUsd: sum(now - WEEK_MS),
      messages: list.length,
      lastActivity: list.length ? list[list.length - 1].ts : null,
      typicalWindowUsd: typicalUsd,
      byModel: Object.values(byModel).sort((a, b) => b.usd - a.usd),
      window: active
        ? {
            startedAt: new Date(active.startMs).toISOString(),
            resetsAt: new Date(active.endMs).toISOString(),
            usd: active.usd,
            tokens: active.tokens,
            messages: active.messages,
            // Fração da janela típica já consumida. Estimativa, não o limite real.
            fillRatio: typicalUsd ? Math.min(active.usd / typicalUsd, 1) : null,
          }
        : null, // sem janela ativa = a conta está livre agora
    });
  }

  accounts.sort((a, b) => a.account.localeCompare(b.account));
  return { generatedAt: new Date(now).toISOString(), accounts };
}
