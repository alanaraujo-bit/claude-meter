import { NextResponse } from 'next/server';
import { query, ensureSchema } from '../../../lib/db.js';
import { summarize } from '../../../lib/windows.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Janelas de 5h + agregados de 7 dias: 10 dias de eventos cobrem tudo que a
// tela mostra, sem varrer a tabela inteira a cada refresh.
const LOOKBACK_DAYS = 10;

export async function GET() {
  try {
    await ensureSchema();

    const { rows } = await query(
      `SELECT message_id, ts, account, model,
              input_tokens, output_tokens, cache_write_5m, cache_write_1h, cache_read
         FROM usage_events
        WHERE ts >= now() - ($1 || ' days')::interval
        ORDER BY ts ASC`,
      [String(LOOKBACK_DAYS)]
    );

    // O total histórico vem agregado no banco — não faz sentido trazer 24k
    // linhas pro Node só pra somar.
    const { rows: totals } = await query(
      `SELECT account,
              COUNT(*)                AS messages,
              MIN(ts)                 AS first_seen,
              MAX(ts)                 AS last_seen
         FROM usage_events
        GROUP BY account`
    );

    const summary = summarize(rows);
    const byAccount = new Map(totals.map((t) => [t.account, t]));
    for (const acc of summary.accounts) {
      const t = byAccount.get(acc.account);
      acc.allTimeMessages = t ? Number(t.messages) : acc.messages;
      acc.firstSeen = t?.first_seen ?? null;
      // `totalUsd` só cobre a janela de lookback — deixar isso explícito
      // evita alguém ler como gasto histórico.
      acc.periodDays = LOOKBACK_DAYS;
    }

    return NextResponse.json(summary, {
      headers: { 'cache-control': 'no-store' },
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'falha ao consultar', detail: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}
