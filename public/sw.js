// Minimal service worker for event reminders: receives Web Push messages
// from the server (so reminders arrive while the app is closed), lets the
// page show notifications via registration.showNotification (required on
// Android) and brings the app forward on tap. No fetch handler — nothing is
// cached.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let msg = {};
  try {
    msg = event.data ? event.data.json() : {};
  } catch {
    msg = { body: event.data ? event.data.text() : '' };
  }
  // iOS revokes the subscription if a push ends without a visible notification.
  event.waitUntil(
    self.registration.showNotification(msg.title || 'CDMM', {
      body: msg.body || '',
      tag: msg.tag,
      icon: '/logo.png',
      badge: '/logo.png',
      data: { url: msg.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ('focus' in w) return w.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
