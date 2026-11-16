import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { registerPwa } from '../lib/pwa'

class WorkerStub extends EventTarget {
  state = 'installing'
  postMessage = vi.fn()
}

function setup({ controlled = true, waiting = true } = {}) {
  const nextWorker = new WorkerStub()
  const registration = Object.assign(new EventTarget(), {
    active: controlled ? new WorkerStub() : null,
    waiting: waiting ? nextWorker : null,
    installing: null as WorkerStub | null,
    update: vi.fn().mockResolvedValue(undefined),
  })
  const workers = Object.assign(new EventTarget(), {
    controller: controlled ? new WorkerStub() : null,
    register: vi.fn().mockResolvedValue(registration),
  })
  const reload = vi.fn()
  const windowStub = Object.assign(new EventTarget(), {
    isSecureContext: true,
    location: { reload },
  })
  const documentStub = Object.assign(new EventTarget(), { visibilityState: 'visible' })
  const navigatorStub = { serviceWorker: workers, onLine: true }
  vi.stubGlobal('window', windowStub)
  vi.stubGlobal('document', documentStub)
  vi.stubGlobal('navigator', navigatorStub)
  const onUpdateReady = vi.fn()
  const onUpdateError = vi.fn()
  const stop = registerPwa({ onUpdateReady, onUpdateError })!
  return { nextWorker, registration, workers, reload, windowStub, documentStub, navigatorStub, onUpdateReady, onUpdateError, stop }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('PWAの更新', () => {
  it('初回インストールでは通知・再読み込みを行わない', async () => {
    const app = setup({ controlled: false, waiting: false })
    await vi.runAllTicks()
    await Promise.resolve()
    app.workers.controller = app.nextWorker
    app.workers.dispatchEvent(new Event('controllerchange'))
    expect(app.onUpdateReady).not.toHaveBeenCalled()
    expect(app.reload).not.toHaveBeenCalled()
    expect(app.workers.register).toHaveBeenCalledWith('/sw.js', { scope: '/', updateViaCache: 'none' })
    app.stop()
  })

  it('更新待機中の版は明示操作後に有効化し、1回だけ再読み込みする', async () => {
    const app = setup()
    await Promise.resolve()
    expect(app.onUpdateReady).toHaveBeenCalledOnce()
    expect(app.nextWorker.postMessage).not.toHaveBeenCalled()
    expect(app.reload).not.toHaveBeenCalled()
    const apply = app.onUpdateReady.mock.calls[0][0]
    apply()
    apply()
    expect(app.nextWorker.postMessage).toHaveBeenCalledExactlyOnceWith({ type: 'SKIP_WAITING' })
    app.workers.dispatchEvent(new Event('controllerchange'))
    app.workers.dispatchEvent(new Event('controllerchange'))
    expect(app.reload).toHaveBeenCalledOnce()
    app.stop()
  })

  it('別タブで更新されても入力中のタブは自動で再読み込みしない', async () => {
    const app = setup({ waiting: false })
    await Promise.resolve()
    app.workers.controller = app.nextWorker
    app.workers.dispatchEvent(new Event('controllerchange'))
    expect(app.reload).not.toHaveBeenCalled()
    expect(app.onUpdateReady).toHaveBeenCalledOnce()
    app.onUpdateReady.mock.calls[0][0]()
    expect(app.reload).toHaveBeenCalledOnce()
    app.stop()
  })

  it('起動後にインストールされた更新を通知する', async () => {
    const app = setup({ waiting: false })
    await Promise.resolve()
    app.registration.installing = app.nextWorker
    app.registration.dispatchEvent(new Event('updatefound'))
    app.registration.waiting = app.nextWorker
    app.nextWorker.state = 'installed'
    app.nextWorker.dispatchEvent(new Event('statechange'))
    expect(app.onUpdateReady).toHaveBeenCalledOnce()
    expect(app.reload).not.toHaveBeenCalled()
    app.stop()
  })

  it('画面復帰・オンライン復帰・定期確認で更新を再検出できる', async () => {
    const app = setup()
    await vi.advanceTimersByTimeAsync(0)
    expect(app.registration.update).toHaveBeenCalledTimes(1)
    app.documentStub.visibilityState = 'hidden'
    app.documentStub.dispatchEvent(new Event('visibilitychange'))
    expect(app.registration.update).toHaveBeenCalledTimes(1)
    app.documentStub.visibilityState = 'visible'
    app.documentStub.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)
    expect(app.registration.update).toHaveBeenCalledTimes(2)
    app.windowStub.dispatchEvent(new Event('online'))
    await vi.advanceTimersByTimeAsync(5 * 60_000)
    expect(app.registration.update).toHaveBeenCalledTimes(4)
    // Periodic checks do not reannounce the same update; returning to the app does.
    expect(app.onUpdateReady).toHaveBeenCalledTimes(3)
    app.stop()
    await vi.advanceTimersByTimeAsync(5 * 60_000)
    app.windowStub.dispatchEvent(new Event('online'))
    expect(app.registration.update).toHaveBeenCalledTimes(4)
  })

  it('オフライン・有効化タイムアウトでは再試行でき、勝手に再読み込みしない', async () => {
    const app = setup()
    await Promise.resolve()
    app.navigatorStub.onLine = false
    app.onUpdateReady.mock.calls[0][0]()
    expect(app.onUpdateError).toHaveBeenCalledOnce()
    expect(app.nextWorker.postMessage).not.toHaveBeenCalled()
    app.navigatorStub.onLine = true
    app.onUpdateError.mock.calls[0][0]()
    await vi.advanceTimersByTimeAsync(15_000)
    expect(app.onUpdateError).toHaveBeenCalledTimes(2)
    expect(app.reload).not.toHaveBeenCalled()
    app.stop()
  })

  it('登録完了前のアンマウント後に通知や監視を開始しない', async () => {
    const app = setup()
    app.stop()
    await Promise.resolve()
    expect(app.onUpdateReady).not.toHaveBeenCalled()
    expect(app.registration.update).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
})
