/* Service worker — מאפשר התקנה כאפליקציה ופתיחה מהירה גם ללא רשת.
 * אסטרטגיה: cache-first לקבצי המעטפת, network-first לנתונים (health.json). */
const CACHE = 'health-app-v27';
const SHELL = [
  './',
  './index.html',
  './style.css',
  './shell.css',
  './common.js',
  './app.js',
  './hub.js',
  './vendor/chart.umd.min.js',
  './manifest.webmanifest',
  './fonts/rubik-hebrew.woff2',
  './fonts/rubik-latin.woff2',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './money/',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  // הנתונים: קודם רשת (טרי), נפילה למטמון אם אין קליטה
  if (request.url.includes('health.json')) {
    event.respondWith(
      fetch(request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(request, copy));
        return res;
      }).catch(() => caches.match(request))
    );
    return;
  }

  // מעטפת: קודם מטמון, נפילה לרשת
  event.respondWith(caches.match(request).then(hit => hit || fetch(request)));
});
