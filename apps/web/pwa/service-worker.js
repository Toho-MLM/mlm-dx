// Replaced at build time, so every deployment is detected even if only the API changed.
const BUILD_ID = '__MLM_BUILD_ID__'
const CACHE_PREFIX = 'mlm-dx-offline-'
const CACHE_NAME = `${CACHE_PREFIX}${BUILD_ID}`
// Cloudflare serves offline.html at /offline and redirects the .html URL.
// A redirected cached response cannot be used for a navigation with redirect: manual.
const OFFLINE_URL = '/offline'

self.addEventListener('install', (event) => {
  // Cache only a public, self-contained fallback. Never cache user data or app bundles.
  event.waitUntil(caches.open(CACHE_NAME).then(async (cache) => {
    await cache.add(new Request(new URL(OFFLINE_URL, self.location.origin), {
      cache: 'reload',
      redirect: 'error',
    }))
  }))
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys
      .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
      .map((key) => caches.delete(key)))
    await self.clients.claim()
  })())
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    event.waitUntil(self.skipWaiting())
  }
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  // Leave API, OAuth, RSC, assets and mutations entirely to the browser/network.
  if (request.method !== 'GET' || request.mode !== 'navigate' ||
      url.origin !== self.location.origin || url.pathname === '/api' ||
      url.pathname.startsWith('/api/')) return

  event.respondWith((async () => {
    try {
      return await fetch(request, { cache: 'no-store' })
    } catch {
      const cache = await caches.open(CACHE_NAME)
      const offline = await cache.match(OFFLINE_URL)
      return offline || Response.error()
    }
  })())
})
