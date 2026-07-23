// Preços oficiais da Anthropic API, em USD por 1.000.000 de tokens.
// Multiplicadores de cache: escrita 5m = 1.25x, escrita 1h = 2.0x, leitura = 0.1x.
//
// Este arquivo é a única fonte de verdade de preço. Mudou preço na Anthropic?
// Edite aqui, faça commit, e o Vercel publica — nada muda na máquina do Alan.

const CACHE_WRITE_5M = 1.25;
const CACHE_WRITE_1H = 2.0;
const CACHE_READ = 0.1;

// `intro` = preço promocional vigente até `until` (exclusivo).
export const MODELS = {
  'claude-opus-4-8': { label: 'Opus 4.8', input: 5, output: 25 },
  'claude-opus-4-7': { label: 'Opus 4.7', input: 5, output: 25 },
  'claude-opus-4-6': { label: 'Opus 4.6', input: 5, output: 25 },
  'claude-fable-5': { label: 'Fable 5', input: 10, output: 50 },
  'claude-mythos-5': { label: 'Mythos 5', input: 10, output: 50 },
  'claude-sonnet-5': {
    label: 'Sonnet 5',
    input: 3,
    output: 15,
    intro: { input: 2, output: 10, until: '2026-09-01T00:00:00Z' },
  },
  'claude-sonnet-4-6': { label: 'Sonnet 4.6', input: 3, output: 15 },
  'claude-haiku-4-5': { label: 'Haiku 4.5', input: 1, output: 5 },
};

/** IDs com sufixo de data (claude-haiku-4-5-20251001) resolvem para o alias. */
export function resolveModel(id) {
  if (!id || id === '<synthetic>') return null;
  if (MODELS[id]) return id;
  const stripped = id.replace(/-\d{8}$/, '');
  return MODELS[stripped] ? stripped : null;
}

export function ratesFor(modelId, timestamp) {
  const key = resolveModel(modelId);
  if (!key) return null;
  const m = MODELS[key];
  const base =
    m.intro && new Date(timestamp) < new Date(m.intro.until)
      ? { input: m.intro.input, output: m.intro.output }
      : { input: m.input, output: m.output };
  return {
    model: key,
    label: m.label,
    input: base.input,
    output: base.output,
    cacheWrite5m: base.input * CACHE_WRITE_5M,
    cacheWrite1h: base.input * CACHE_WRITE_1H,
    cacheRead: base.input * CACHE_READ,
  };
}

/** Custo equivalente em API (USD) de um evento já normalizado. */
export function costOf(ev) {
  const r = ratesFor(ev.model, ev.ts);
  if (!r) return 0;
  return (
    (Number(ev.input_tokens || 0) * r.input +
      Number(ev.output_tokens || 0) * r.output +
      Number(ev.cache_write_5m || 0) * r.cacheWrite5m +
      Number(ev.cache_write_1h || 0) * r.cacheWrite1h +
      Number(ev.cache_read || 0) * r.cacheRead) /
    1e6
  );
}
