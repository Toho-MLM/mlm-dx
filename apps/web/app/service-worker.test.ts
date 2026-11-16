import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

type SwEvent = {
  request?: { url: string; method: string; mode: string }
  data?: { type: string }
  waitUntil: ReturnType<typeof vi.fn>
  respondWith: ReturnType<typeof vi.fn>
}

function setup() {
  const listeners = new Map<string, (event: SwEvent) => void>()
  const cache = { add: vi.fn().mockResolvedValue(undefined), match: vi.fn().mockResolvedValue(new Response('offline')) }
  const caches = {
    open: vi.fn().mockResolvedValue(cache),
    keys: vi.fn().mockResolvedValue(['mlm-dx-offline-old', 'mlm-dx-offline-test', 'another-app']),
    delete: vi.fn().mockResolvedValue(true),
  }
  const self = {
    location: { origin: 'https://mlm.example' },
    clients: { claim: vi.fn().mockResolvedValue(undefined) },
    skipWaiting: vi.fn().mockResolvedValue(undefined),
    addEventListener: (type: string, handler: (event: SwEvent) => void) => listeners.set(type, handler),
  }
  const fetch = vi.fn().mockResolvedValue(new Response('latest'))
  const source = readFileSync(new URL('../pwa/service-worker.js', import.meta.url), 'utf8')
  runInNewContext(source.replace('__MLM_BUILD_ID__', 'test'), { self, caches, fetch, URL, Request, Response })
  function dispatch(type: string, properties: Partial<SwEvent> = {}) {
    const event = { waitUntil: vi.fn(), respondWith: vi.fn(), ...properties }
    listeners.get(type)!(event)
    return event
  }
  return { cache, caches, self, fetch, dispatch }
}

describe('Service Workerのキャッシュと更新境界', () => {
  it('公開オフライン画面だけを保存し、インストール時は更新を強制しない', async () => {
    const sw = setup()
    const event = sw.dispatch('install')
    await event.waitUntil.mock.calls[0][0]
    expect(sw.cache.add).toHaveBeenCalledOnce()
    const request = sw.cache.add.mock.calls[0][0] as Request
    expect(request.url).toBe('https://mlm.example/offline')
    expect(request.cache).toBe('reload')
    expect(request.redirect).toBe('error')
    expect(sw.self.skipWaiting).not.toHaveBeenCalled()
  })

  it('有効化時はこのアプリの旧キャッシュだけを削除する', async () => {
    const sw = setup()
    const event = sw.dispatch('activate')
    await event.waitUntil.mock.calls[0][0]
    expect(sw.caches.delete).toHaveBeenCalledExactlyOnceWith('mlm-dx-offline-old')
    expect(sw.self.clients.claim).toHaveBeenCalledOnce()
  })

  it('更新要求のメッセージを受け取った場合だけ即時有効化する', async () => {
    const sw = setup()
    sw.dispatch('message', { data: { type: 'OTHER' } })
    expect(sw.self.skipWaiting).not.toHaveBeenCalled()
    const event = sw.dispatch('message', { data: { type: 'SKIP_WAITING' } })
    await event.waitUntil.mock.calls[0][0]
    expect(sw.self.skipWaiting).toHaveBeenCalledOnce()
  })

  it.each([
    ['/api', 'GET', 'navigate'],
    ['/api/auth/callback/google', 'GET', 'navigate'],
    ['/api/reservations', 'POST', 'cors'],
    ['/reservation?_rsc=abc', 'GET', 'cors'],
    ['/assets/app.js', 'GET', 'no-cors'],
    ['https://accounts.google.com/', 'GET', 'navigate'],
    ['/reservation', 'POST', 'navigate'],
  ])('%s (%s / %s)を横取りしない', (path, method, mode) => {
    const sw = setup()
    const event = sw.dispatch('fetch', { request: { url: new URL(path, 'https://mlm.example').href, method, mode } })
    expect(event.respondWith).not.toHaveBeenCalled()
    expect(sw.fetch).not.toHaveBeenCalled()
    expect(sw.caches.open).not.toHaveBeenCalled()
  })

  it('通常遷移はHTTPキャッシュを使わず、通信失敗時だけオフライン画面へ戻す', async () => {
    const sw = setup()
    const request = { url: 'https://mlm.example/reservation', method: 'GET', mode: 'navigate' }
    const online = sw.dispatch('fetch', { request })
    expect(await (await online.respondWith.mock.calls[0][0]).text()).toBe('latest')
    expect(sw.fetch).toHaveBeenCalledWith(request, { cache: 'no-store' })
    expect(sw.caches.open).not.toHaveBeenCalled()
    sw.fetch.mockRejectedValueOnce(new Error('offline'))
    const offline = sw.dispatch('fetch', { request })
    expect(await (await offline.respondWith.mock.calls[0][0]).text()).toBe('offline')
    expect(sw.cache.match).toHaveBeenCalledWith('/offline')
  })

  it('401やサーバーエラーをオフライン画面に置き換えない', async () => {
    const sw = setup()
    sw.fetch.mockResolvedValueOnce(new Response('unauthorized', { status: 401 }))
    const event = sw.dispatch('fetch', { request: { url: 'https://mlm.example/profile', method: 'GET', mode: 'navigate' } })
    expect((await event.respondWith.mock.calls[0][0]).status).toBe(401)
    expect(sw.caches.open).not.toHaveBeenCalled()
  })
})
