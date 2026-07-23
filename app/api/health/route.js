import { NextResponse } from 'next/server';
import { query } from '../../../lib/db.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Checagem rápida de que a app subiu e alcança o Postgres. */
export async function GET() {
  const out = { app: 'ok', db: 'desconhecido', ingestToken: Boolean(process.env.INGEST_TOKEN) };
  try {
    const { rows } = await query('SELECT 1 AS ok');
    out.db = rows[0]?.ok === 1 ? 'ok' : 'inesperado';
  } catch (err) {
    out.db = 'falha';
    out.dbError = String(err?.message ?? err);
  }
  return NextResponse.json(out, { status: out.db === 'ok' ? 200 : 503 });
}
