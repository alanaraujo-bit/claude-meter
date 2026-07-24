import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Configuração pública do cliente. A chave VAPID pública é, por definição,
 * pública — é ela que o navegador usa para criar a inscrição de push.
 */
export async function GET() {
  return NextResponse.json({
    vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? null,
    pushEnabled: Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY),
  });
}
