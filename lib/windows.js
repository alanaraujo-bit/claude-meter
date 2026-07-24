import { costOf, resolveModel, MODELS } from './pricing.js';

// A janela de sessão do plano Pro dura 5h e começa na primeira mensagem depois
// que a janela anterior expirou. A Anthropic não expõe o horário do reset em
// lugar nenhum — nem em header, nem em cache local — então derivamos dos
// próprios timestamps. É exato ao minuto enquanto os eventos estiverem completos.
export const WINDOW_MS = 5 * 60 * 60 * 1000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const tokensOf = (e) => ({
  input: Number(e.input_tokens || 0),
  output: Number(e.output_tokens || 0),
  write: Number(e.cache_write_5m || 0) + Number(e.cache_write_1h || 0),
  read: Number(e.cache_read || 0),
});

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
    const tk = tokensOf(e);
    cur.messages++;
    cur.usd += costOf(e);
    cur.tokens += tk.input + tk.output + tk.write + tk.read;
  }
  return out;
}

/** Série por hora das últimas `hours` horas — alimenta o gráfico de barras. */
function hourly(events, now, hours = 24) {
  const buckets = Array.from({ length: hours }, (_, i) => ({
    startMs: now - (hours - 1 - i) * 3_600_000,
    usd: 0,
    messages: 0,
  }));
  const base = now - (hours - 1) * 3_600_000;
  for (const e of events) {
    const t = new Date(e.ts).getTime();
    const idx = Math.floor((t - base) / 3_600_000);
    if (idx >= 0 && idx < hours) {
      buckets[idx].usd += costOf(e);
      buckets[idx].messages++;
    }
  }
  return buckets;
}

/** Série por dia dos últimos `days` dias. */
function daily(events, now, days = 14) {
  const startOfDay = (ms) => {
    const d = new Date(ms);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const today = startOfDay(now);
  const buckets = Array.from({ length: days }, (_, i) => ({
    dayMs: today - (days - 1 - i) * DAY_MS,
    usd: 0,
    messages: 0,
  }));
  const index = new Map(buckets.map((b, i) => [b.dayMs, i]));
  for (const e of events) {
    const i = index.get(startOfDay(new Date(e.ts).getTime()));
    if (i != null) {
      buckets[i].usd += costOf(e);
      buckets[i].messages++;
    }
  }
  return buckets;
}

/**
 * Estado por conta. `msToReset` no cliente sai de `window.resetsAt`:
 * o servidor nunca manda contagem regressiva pronta, senão ela nasce velha.
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

    // Média histórica por janela — a régua para dizer se a janela atual está
    // pesada. É o melhor proxy disponível: a Anthropic não publica o limite do Pro.
    const closed = wins.filter((w) => w.endMs <= now);
    const typicalUsd = closed.length
      ? closed.reduce((s, w) => s + w.usd, 0) / closed.length
      : null;
    const peakUsd = closed.length ? Math.max(...closed.map((w) => w.usd)) : null;

    const tot = { input: 0, output: 0, write: 0, read: 0 };
    const byModel = {};
    const byProject = {};
    for (const e of list) {
      const tk = tokensOf(e);
      tot.input += tk.input;
      tot.output += tk.output;
      tot.write += tk.write;
      tot.read += tk.read;

      const key = resolveModel(e.model);
      if (key) {
        byModel[key] ??= { model: key, label: MODELS[key].label, usd: 0, messages: 0, tokens: 0 };
        byModel[key].usd += costOf(e);
        byModel[key].messages++;
        byModel[key].tokens += tk.input + tk.output + tk.write + tk.read;
      }
      if (e.project) {
        byProject[e.project] ??= { project: e.project, usd: 0, messages: 0 };
        byProject[e.project].usd += costOf(e);
        byProject[e.project].messages++;
      }
    }

    const sum = (since) =>
      list.filter((e) => new Date(e.ts).getTime() >= since).reduce((s, e) => s + costOf(e), 0);

    const totalTokens = tot.input + tot.output + tot.write + tot.read;

    accounts.push({
      account,
      totalUsd: list.reduce((s, e) => s + costOf(e), 0),
      dayUsd: sum(now - DAY_MS),
      weekUsd: sum(now - WEEK_MS),
      messages: list.length,
      lastActivity: list.length ? list[list.length - 1].ts : null,
      typicalWindowUsd: typicalUsd,
      peakWindowUsd: peakUsd,
      windowsCount: wins.length,
      tokens: { ...tot, total: totalTokens },
      // Proporção do input servida por cache: quanto maior, mais barato sai
      // cada turno. É a métrica de eficiência mais útil aqui.
      cacheHitRatio: tot.read + tot.write + tot.input > 0
        ? tot.read / (tot.read + tot.write + tot.input)
        : null,
      byModel: Object.values(byModel).sort((a, b) => b.usd - a.usd),
      byProject: Object.values(byProject).sort((a, b) => b.usd - a.usd).slice(0, 8),
      hourly: hourly(list, now, 24),
      daily: daily(list, now, 14),
      window: active
        ? {
            startedAt: new Date(active.startMs).toISOString(),
            resetsAt: new Date(active.endMs).toISOString(),
            usd: active.usd,
            tokens: active.tokens,
            messages: active.messages,
            fillRatio: typicalUsd ? Math.min(active.usd / typicalUsd, 1) : null,
          }
        : null, // sem janela ativa = conta livre agora
    });
  }

  accounts.sort((a, b) => a.account.localeCompare(b.account));

  const totals = accounts.reduce(
    (s, a) => ({
      usd: s.usd + a.totalUsd,
      dayUsd: s.dayUsd + a.dayUsd,
      weekUsd: s.weekUsd + a.weekUsd,
      messages: s.messages + a.messages,
      tokens: s.tokens + a.tokens.total,
    }),
    { usd: 0, dayUsd: 0, weekUsd: 0, messages: 0, tokens: 0 }
  );

  return { generatedAt: new Date(now).toISOString(), accounts, totals };
}
