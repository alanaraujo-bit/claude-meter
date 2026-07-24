import { NextResponse } from 'next/server';
import { query, ensureSchema } from '../../../lib/db.js';
import { summarize } from '../../../lib/windows.js';
import { insightsFor } from '../../../lib/insights.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Janelas de 5h, série diária de 14 dias e agregados de 7 dias: 15 dias de
// eventos cobrem tudo que as telas mostram, sem varrer a tabela inteira.
const LOOKBACK_DAYS = 15;

export async function GET() {
  try {
    await ensureSchema();

    const { rows } = await query(
      `SELECT ts, account, model, project,
              input_tokens, output_tokens, cache_write_5m, cache_write_1h, cache_read
         FROM usage_events
        WHERE ts >= now() - ($1 || ' days')::interval
        ORDER BY ts ASC`,
      [String(LOOKBACK_DAYS)]
    );

    // Totais históricos vêm agregados do banco — não faz sentido trazer todas
    // as linhas para o Node só para somar.
    const { rows: totals } = await query(
      `SELECT account, COUNT(*)::int AS messages, MIN(ts) AS first_seen
         FROM usage_events GROUP BY account`
    );

    const summary = summarize(rows);
    const byAccount = new Map(totals.map((t) => [t.account, t]));
    for (const acc of summary.accounts) {
      const t = byAccount.get(acc.account);
      acc.allTimeMessages = t ? t.messages : acc.messages;
      acc.firstSeen = t?.first_seen ?? null;
      // Deixa explícito que `totalUsd` cobre só o lookback, não a vida toda.
      acc.periodDays = LOOKBACK_DAYS;
    }

    summary.insights = insightsFor(summary);
    summary.pushEnabled = Boolean(process.env.VAPID_PUBLIC_KEY);

    return NextResponse.json(summary, { headers: { 'cache-control': 'no-store' } });
  } catch (err) {
    return NextResponse.json(
      { error: 'falha ao consultar', detail: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}
