// Offline support: answer from cache instantly, refresh the cache in the background, so edits show on the next load.
// Add new pages/lineups here so they are cached on first visit (anything else is cached the first time it's opened).
const CACHE = 'line-us-up-v1';
const FILES = [
  './', 'index.html', 'now.html', 'print.html', 'app.js', 'now.js', 'print.js', 'lib.js', 'shared.js', 'spotify.js',
  'style.css', 'theme-tomorrowland.css', 'favicon.svg',
  'lineups/edc-thailand-2026-dec.json', 'lineups/edc-thailand-2026-jan.json', 'lineups/tomorrowland-thailand-2026.json',
  'https://cdn.jsdelivr.net/npm/tom-select@2.3.1/dist/css/tom-select.css',
  'https://cdn.jsdelivr.net/npm/tom-select@2.3.1/dist/js/tom-select.complete.min.js',
];

self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES))));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))));

self.addEventListener('fetch', e => {
  const req = e.request;
  // Only our own files and the CDN; Spotify API calls and POSTs go straight to the network.
  if (req.method !== 'GET' || !(req.url.startsWith(self.location.origin) || req.url.startsWith('https://cdn.jsdelivr.net/'))) return;
  const key = req.url.split('?')[0]; // index.html?lineup=… and ?code=… are all the same file
  e.respondWith(caches.open(CACHE).then(async cache => {
    const cached = await cache.match(key);
    const fresh = fetch(req).then(res => { if (res.ok) cache.put(key, res.clone()); return res; });
    if (!cached) return fresh;
    e.waitUntil(fresh.catch(() => {})); // offline: keep serving the cached copy
    return cached;
  }));
});
