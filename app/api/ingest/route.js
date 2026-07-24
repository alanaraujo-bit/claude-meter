import { NextResponse } from 'next/server';
import { query, ensureSchema } from '../../../lib/db.js';
import { summarize } from '../../../lib/windows.js';
import { insightsFor } from '../../../lib/insights.js';
import { maybeAlert } from '../../../lib/push.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_EVENTS = 5000;

function unauthorized() {
  return NextResponse.json({ error: 'não autorizado' }, { status: 401 });
}

/**
 * Recebe eventos de uso do hook local.
 *
 * O corpo é só metadado: tokens, modelo, timestamp, conta. Nunca conteúdo de
 * conversa. `message_id` é a chave primária, então reenviar é seguro — o
 * ON CONFLICT DO NOTHING descarta duplicata sem inflar a contagem.
 */
export async function POST(req) {
  const token = process.env.INGEST_TOKEN;
  if (!token) {
    return NextResponse.json({ error: 'INGEST_TOKEN não configurado' }, { status: 500 });
  }
  if (req.headers.get('authorization') !== `Bearer ${token}`) return unauthorized();

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const events = Array.isArray(body?.events) ? body.events : null;
  if (!events) return NextResponse.json({ error: 'campo events ausente' }, { status: 400 });
  if (events.length > MAX_EVENTS) {
    return NextResponse.json(
      { error: `no máximo ${MAX_EVENTS} eventos por requisição` },
      { status: 413 }
    );
  }
  if (events.length === 0) return NextResponse.json({ inserted: 0, received: 0 });

  await ensureSchema();

  // Um único INSERT com VALUES multi-linha: 5000 eventos em uma ida ao banco.
  const cols = 11;
  const values = [];
  const rows = [];
  let n = 0;
  for (const e of events) {
    if (!e?.message_id || !e?.ts || !e?.account || !e?.model) continue;
    rows.push(`($${++n},$${++n},$${++n},$${++n},$${++n},$${++n},$${++n},$${++n},$${++n},$${++n},$${++n})`);
    values.push(
      String(e.message_id),
      new Date(e.ts).toISOString(),
      String(e.account),
      String(e.model),
      e.session_id ? String(e.session_id) : null,
      e.project ? String(e.project) : null,
      Number(e.input_tokens) || 0,
      Number(e.output_tokens) || 0,
      Number(e.cache_write_5m) || 0,
      Number(e.cache_write_1h) || 0,
      Number(e.cache_read) || 0
    );
  }
  if (rows.length === 0) {
    return NextResponse.json({ inserted: 0, received: events.length, skipped: events.length });
  }
  if (values.length !== rows.length * cols) {
    return NextResponse.json({ error: 'erro interno de montagem' }, { status: 500 });
  }

  const result = await query(
    `INSERT INTO usage_events
       (message_id, ts, account, model, session_id, project,
        input_tokens, output_tokens, cache_write_5m, cache_write_1h, cache_read)
     VALUES ${rows.join(',')}
     ON CONFLICT (message_id) DO NOTHING`,
    values
  );

  // O alerta é avaliado aqui, na chegada dos dados — é o único momento em que
  // o estado muda. Assim a notificação chega enquanto você está usando, sem
  // precisar de cron rodando a cada minuto.
  let alerts = null;
  if (result.rowCount > 0) {
    try {
      const { rows: recent } = await query(
        `SELECT ts, account, model,
                input_tokens, output_tokens, cache_write_5m, cache_write_1h, cache_read
           FROM usage_events
          WHERE ts >= now() - interval '15 days'
          ORDER BY ts ASC`
      );
      const summary = summarize(recent);
      alerts = await maybeAlert(summary, insightsFor(summary));
    } catch {
      // Falha ao notificar nunca pode derrubar a ingestão — o dado já está salvo.
    }
  }

  return NextResponse.json({
    inserted: result.rowCount,
    received: events.length,
    duplicates: rows.length - result.rowCount,
    alerts: alerts?.length ?? 0,
  });
}
