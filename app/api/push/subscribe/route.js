import { NextResponse } from 'next/server';
import { query, ensureSchema } from '../../../../lib/db.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Registra (ou atualiza) a inscrição de push deste dispositivo. */
export async function POST(req) {
  let sub;
  try {
    sub = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const endpoint = sub?.endpoint;
  const p256dh = sub?.keys?.p256dh;
  const auth = sub?.keys?.auth;
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: 'inscrição incompleta' }, { status: 400 });
  }

  await ensureSchema();
  await query(
    `INSERT INTO push_subscriptions (endpoint, p256dh, auth, label)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (endpoint) DO UPDATE
       SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
    [endpoint, p256dh, auth, sub?.label ?? null]
  );

  const { rows } = await query('SELECT COUNT(*)::int AS n FROM push_subscriptions');
  return NextResponse.json({ ok: true, devices: rows[0].n });
}

/** Remove a inscrição (usuário desligou as notificações). */
export async function DELETE(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }
  if (!body?.endpoint) return NextResponse.json({ error: 'endpoint ausente' }, { status: 400 });

  await ensureSchema();
  await query('DELETE FROM push_subscriptions WHERE endpoint = $1', [body.endpoint]);
  return NextResponse.json({ ok: true });
}
