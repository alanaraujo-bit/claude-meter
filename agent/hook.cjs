#!/usr/bin/env node
'use strict';
/**
 * Hook UserPromptSubmit do Claude Meter.
 *
 * Faz duas coisas, nesta ordem:
 *   1. Registra qual conta está ativa agora (o transcript não grava isso, e
 *      ~/.claude.json só conhece a conta do momento — sem este ledger, todo o
 *      histórico fica órfão quando você troca de conta com /login).
 *   2. Envia os eventos de uso novos para a API.
 *
 * NÃO é um serviço: o Claude Code dispara, roda uma vez e morre. Configurado
 * como async no settings.json, então nunca segura o prompt.
 *
 * Só metadados saem da máquina — tokens, modelo, timestamp, conta.
 * Nenhum conteúdo de conversa, nenhum caminho de arquivo do seu disco.
 *
 * Regra de ouro: nunca lançar, nunca escrever em stdout. Falha é silenciosa.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

const HOME = os.homedir();
const CLAUDE_DIR = path.join(HOME, '.claude');
const PROJECTS_DIR = path.join(CLAUDE_DIR, 'projects');
const LEDGER = path.join(CLAUDE_DIR, 'meter-ledger.jsonl');
const CURSOR = path.join(CLAUDE_DIR, 'meter-cursor.json');
const CONFIG = path.join(CLAUDE_DIR, 'meter-config.json');
const CLAUDE_JSON = path.join(HOME, '.claude.json');

const CHUNK = 2000;
const FETCH_TIMEOUT_MS = 20_000;
// Reprocessa uma janela curta antes do cursor: eventos podem ser gravados no
// arquivo levemente fora de ordem. Duplicatas são descartadas pelo banco.
const OVERLAP_MS = 10 * 60 * 1000;

const readJson = (p, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return fallback;
  }
};

function activeAccount() {
  try {
    const raw = fs.readFileSync(CLAUDE_JSON, 'utf8');
    // Recorta só o bloco oauthAccount — o arquivo tem centenas de KB de cache
    // e não precisamos de nada além do e-mail.
    const i = raw.indexOf('"oauthAccount"');
    if (i === -1) return null;
    const m = /"emailAddress"\s*:\s*"([^"]+)"/.exec(raw.slice(i, i + 2000));
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/**
 * Limite REAL do plano, direto do cache que o próprio Claude Code mantém em
 * ~/.claude.json → cachedUsageUtilization.
 *
 * Isto substitui a janela de 5h que antes era derivada dos timestamps. A
 * derivação errava sistematicamente: ela assume que a janela começou no
 * primeiro evento observado, mas a coleta quase sempre começa no meio de uma
 * janela já em andamento — o reset saía atrasado pelo tamanho desse pedaço
 * que não foi visto.
 *
 * `resets_at` é absoluto e nunca envelhece. `utilization` é um retrato do
 * instante `fetchedAtMs`, então mandamos esse carimbo junto para a interface
 * poder dizer há quanto tempo o número foi medido.
 */
function officialUsage(email) {
  try {
    const d = JSON.parse(fs.readFileSync(CLAUDE_JSON, 'utf8'));
    const c = d?.cachedUsageUtilization;
    const u = c?.utilization;
    if (!c?.fetchedAtMs || !u) return null;

    // O cache só existe para a conta logada agora. Se o uuid do cache não bate
    // com o da sessão atual, o dado é de outra conta — descartar evita
    // carimbar o consumo de uma conta no cartão da outra.
    if (c.accountUuid && d?.oauthAccount?.accountUuid && c.accountUuid !== d.oauthAccount.accountUuid) {
      return null;
    }

    const pick = (o) =>
      o && typeof o.utilization === 'number' && o.resets_at
        ? { pct: o.utilization, resetsAt: o.resets_at }
        : null;

    const fiveHour = pick(u.five_hour);
    const sevenDay = pick(u.seven_day);
    if (!fiveHour && !sevenDay) return null;

    return { account: email, fetchedAt: new Date(c.fetchedAtMs).toISOString(), fiveHour, sevenDay };
  } catch {
    return null;
  }
}

function recordLedger(sessionId, email) {
  if (!sessionId || !email) return;
  try {
    fs.appendFileSync(
      LEDGER,
      JSON.stringify({ ts: new Date().toISOString(), sessionId, email }) + '\n'
    );
  } catch {
    /* ignora */
  }
}

/** sessionId -> entradas ordenadas do ledger. */
function loadLedger() {
  const bySession = new Map();
  let raw;
  try {
    raw = fs.readFileSync(LEDGER, 'utf8');
  } catch {
    return bySession;
  }
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let e;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    if (!e.sessionId || !e.email || !e.ts) continue;
    if (!bySession.has(e.sessionId)) bySession.set(e.sessionId, []);
    bySession.get(e.sessionId).push(e);
  }
  for (const l of bySession.values()) l.sort((a, b) => (a.ts < b.ts ? -1 : 1));
  return bySession;
}

/**
 * Conta ativa no instante de uma mensagem: a entrada mais recente do mesmo
 * sessionId até aquele timestamp. Sobrevive a troca de conta no meio da sessão.
 */
function accountFor(ledger, sessionId, ts) {
  const entries = ledger.get(sessionId);
  if (!entries) return null;
  let match = null;
  for (const e of entries) {
    if (e.ts <= ts) match = e;
    else break;
  }
  return (match || entries[0]).email;
}

function jsonlFiles(dir, sinceMs, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      jsonlFiles(p, sinceMs, out);
    } else if (entry.name.endsWith('.jsonl')) {
      // Só abre arquivos tocados depois do último envio — é o que mantém o
      // hook rápido mesmo com centenas de transcripts acumulados.
      try {
        if (fs.statSync(p).mtimeMs >= sinceMs) out.push(p);
      } catch {
        /* ignora */
      }
    }
  }
  return out;
}

async function eventsFrom(file, ledger, sinceMs, seen, events) {
  const rl = readline.createInterface({
    input: fs.createReadStream(file, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (!line || line[0] !== '{') continue;
    if (!line.includes('"usage"')) continue; // filtro barato antes do parse
    let d;
    try {
      d = JSON.parse(line);
    } catch {
      continue;
    }
    if (d.type !== 'assistant') continue;
    const m = d.message;
    if (!m || !m.usage || !m.id || !d.timestamp) continue;
    if (seen.has(m.id)) continue;

    const tsMs = Date.parse(d.timestamp);
    if (!Number.isFinite(tsMs) || tsMs < sinceMs) continue;

    const account = accountFor(ledger, d.sessionId, d.timestamp);
    if (!account) continue; // sem conta conhecida, não dá pra atribuir

    seen.add(m.id);
    const u = m.usage;
    const cc = u.cache_creation || {};
    const hasSplit =
      cc.ephemeral_5m_input_tokens != null || cc.ephemeral_1h_input_tokens != null;

    events.push({
      message_id: m.id,
      ts: d.timestamp,
      account,
      model: m.model,
      session_id: d.sessionId,
      // Só o nome da pasta do projeto, nunca o caminho completo do disco.
      project: path.basename(path.dirname(file)),
      input_tokens: u.input_tokens || 0,
      output_tokens: u.output_tokens || 0,
      cache_write_5m: hasSplit
        ? cc.ephemeral_5m_input_tokens || 0
        : u.cache_creation_input_tokens || 0,
      cache_write_1h: hasSplit ? cc.ephemeral_1h_input_tokens || 0 : 0,
      cache_read: u.cache_read_input_tokens || 0,
    });
  }
}

async function post(url, token, body) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  let sessionId = null;
  try {
    sessionId = (JSON.parse(fs.readFileSync(0, 'utf8')) || {}).session_id || null;
  } catch {
    /* payload ausente ou malformado */
  }

  const email = activeAccount();
  recordLedger(sessionId, email);

  const cfg = readJson(CONFIG, null);
  if (!cfg?.url || !cfg?.token) return; // ainda não configurado: só o ledger roda

  // O limite oficial vai em toda execução, mesmo sem evento novo: é ele que
  // manda no countdown, e o reset precisa estar correto no painel mesmo em
  // sessão parada.
  const usage = email ? officialUsage(email) : null;

  const cursor = readJson(CURSOR, {});
  const lastTs = Number(cursor.lastTs) || 0;
  const sinceMs = lastTs ? lastTs - OVERLAP_MS : 0;

  const ledger = loadLedger();
  const events = [];
  const seen = new Set();
  for (const f of jsonlFiles(PROJECTS_DIR, sinceMs)) {
    try {
      await eventsFrom(f, ledger, sinceMs, seen, events);
    } catch {
      /* arquivo ilegível: pula */
    }
  }
  if (events.length === 0) {
    if (usage) await post(cfg.url, cfg.token, { events: [], usage });
    return;
  }

  events.sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));

  let maxOk = lastTs;
  for (let i = 0; i < events.length; i += CHUNK) {
    const batch = events.slice(i, i + CHUNK);
    // O snapshot de limite viaja só no primeiro lote — é estado atual, não série.
    const body = i === 0 ? { events: batch, usage } : { events: batch };
    if (!(await post(cfg.url, cfg.token, body))) break; // falhou: cursor não avança, tenta depois
    maxOk = Math.max(maxOk, Date.parse(batch[batch.length - 1].ts));
  }

  if (maxOk > lastTs) {
    try {
      fs.writeFileSync(CURSOR, JSON.stringify({ lastTs: maxOk }));
    } catch {
      /* ignora */
    }
  }
}

main()
  .catch(() => {})
  .finally(() => process.exit(0));
