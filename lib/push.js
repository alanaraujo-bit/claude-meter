import webpush from 'web-push';
import { query } from './db.js';

let configured = false;

function configure() {
  if (configured) return true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:alanvitoraraujo2a@gmail.com',
    pub,
    priv
  );
  configured = true;
  return true;
}

/**
 * Envia para todos os dispositivos inscritos. Inscrição morta (404/410) é
 * removida na hora — navegador desinstalado ou permissão revogada não deve
 * ficar acumulando erro para sempre.
 */
export async function broadcast(payload) {
  if (!configure()) return { sent: 0, skipped: 'VAPID não configurado' };

  const { rows } = await query('SELECT endpoint, p256dh, auth FROM push_subscriptions');
  if (rows.length === 0) return { sent: 0 };

  let sent = 0;
  const dead = [];
  await Promise.all(
    rows.map(async (r) => {
      try {
        await webpush.sendNotification(
          { endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } },
          JSON.stringify(payload),
          { TTL: 900, urgency: 'high' }
        );
        sent++;
      } catch (err) {
        if (err?.statusCode === 404 || err?.statusCode === 410) dead.push(r.endpoint);
      }
    })
  );

  if (dead.length) {
    await query('DELETE FROM push_subscriptions WHERE endpoint = ANY($1)', [dead]);
  }
  return { sent, removed: dead.length };
}

/**
 * Decide se vale notificar e monta a mensagem.
 *
 * Só dispara em `warn` e `danger`, uma vez por (conta, janela, nível) — então
 * atravessar 65% avisa uma vez, atravessar 90% avisa de novo, e o resto da
 * janela fica em silêncio. A mensagem sempre diz o que FAZER, não só o número.
 */
export async function maybeAlert(summary, insights) {
  const results = [];
  for (const p of insights.per) {
    if (p.level !== 'warn' && p.level !== 'danger') continue;

    const acc = summary.accounts.find((a) => a.account === p.account);
    if (!acc?.window) continue;

    const ins = await query(
      `INSERT INTO alert_state (account, window_start, level)
       VALUES ($1, $2, $3)
       ON CONFLICT (account, window_start, level) DO NOTHING`,
      [p.account, acc.window.startedAt, p.level]
    );
    if (ins.rowCount === 0) continue; // já avisado nesta janela e neste nível

    const short = p.account.split('@')[0];
    const alt = insights.recommendation?.account;
    const action =
      alt && alt !== p.account
        ? ` Troque para ${alt.split('@')[0]}.`
        : ' As duas contas estão pesadas.';

    results.push(
      await broadcast({
        title:
          p.level === 'danger'
            ? `${short} está no limite`
            : `${short} em ${Math.round((acc.window.fillRatio ?? 0) * 100)}%`,
        body: p.detail + action,
        tag: `meter-${p.account}`,
        level: p.level,
        url: '/',
      })
    );
  }
  return results;
}
