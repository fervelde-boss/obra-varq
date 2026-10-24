// Service worker: guarda la "cáscara" de la app para que abra rápido.
// Los datos siempre se piden en línea (hay buena señal en obra).
// v12: nunca deja la pantalla en negro; si la red falla, abre la copia guardada
// o muestra un aviso con botón para reintentar.
const CACHE = 'obra-va-v16';
const SHELL = ['./', './index.html', './manifest.webmanifest', './img/logo-horizontal.png', './img/icon-192.png', './app.js', './app.css', './config.js'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
const AVISO = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<body style="font-family:-apple-system,Arial,sans-serif;background:#f2f4f7;color:#1d2b44;padding:40px 20px;text-align:center">' +
  '<h2>Sin conexión</h2><p>No se pudo abrir Obra VA. Revisa la señal o el WiFi.</p>' +
  '<button onclick="location.reload()" style="padding:12px 24px;font-size:16px;border:0;border-radius:8px;background:#1d2b44;color:#fff">Reintentar</button></body>';
function conTiempo(p, ms) {
  return new Promise((ok, no) => { const t = setTimeout(() => no(new Error('tiempo')), ms); p.then(r => { clearTimeout(t); ok(r); }, e => { clearTimeout(t); no(e); }); });
}
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  const esPagina = e.request.mode === 'navigate';
  e.respondWith(
    conTiempo(fetch(e.request), esPagina ? 6000 : 10000).then(r => {
      if (r && r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true })
      .then(m => m || (esPagina ? caches.match('./index.html') : undefined))
      .then(m => m || (esPagina ? new Response(AVISO, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }) : Response.error())))
  );
});
