import { NextResponse } from 'next/server';
import { ensureSchema } from '../../../../lib/db.js';
import { broadcast } from '../../../../lib/push.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Dispara uma notificação de teste para todos os dispositivos inscritos. */
export async function POST() {
  await ensureSchema();
  const result = await broadcast({
    title: 'Claude Meter',
    body: 'Notificações funcionando. É assim que o alerta vai chegar.',
    tag: 'meter-test',
    level: 'ok',
    url: '/',
  });
  return NextResponse.json(result);
}
