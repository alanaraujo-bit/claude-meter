/* Service worker do Claude Meter.
   Escopo enxuto de propósito: recebe push e trata o clique. Sem cache offline —
   os dados aqui são de tempo real, e servir número velho seria pior que não servir. */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Claude Meter', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'Claude Meter';
  const options = {
    body: data.body || '',
    // `tag` faz a notificação nova SUBSTITUIR a anterior da mesma conta,
    // em vez de empilhar cinco avisos sobre a mesma janela.
    tag: data.tag || 'meter',
    renotify: true,
    icon: '/icon-192.png',
    badge: '/badge.png',
    data: { url: data.url || '/' },
    vibrate: data.level === 'danger' ? [60, 40, 60] : [40],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';

  // Foca uma aba já aberta em vez de abrir outra — comportamento de app nativo.
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          client.navigate?.(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
