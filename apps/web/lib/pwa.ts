type PwaNotifications = {
  onUpdateReady: (reload: () => void) => void
  onUpdateError: (retry: () => void) => void
}

/** Never reload an editing tab until its user explicitly chooses to update. */
export function registerPwa({ onUpdateReady, onUpdateError }: PwaNotifications) {
  if (!window.isSecureContext || !('serviceWorker' in navigator)) return

  const workers = navigator.serviceWorker
  let registration: ServiceWorkerRegistration | undefined
  let disposed = false
  let hadController = !!workers.controller
  let needsReload = false
  let applying = false
  let reloaded = false
  let checking = false
  let notified = false
  let activationTimeout: ReturnType<typeof setTimeout> | undefined
  const watchedWorkers = new Map<ServiceWorker, () => void>()

  const reload = () => {
    if (reloaded || disposed) return
    reloaded = true
    window.location.reload()
  }

  const applyUpdate = () => {
    if (applying || disposed) return
    if (!navigator.onLine) {
      onUpdateError(applyUpdate)
      return
    }
    if (needsReload || !registration?.waiting) {
      reload()
      return
    }

    applying = true
    activationTimeout = setTimeout(() => {
      applying = false
      onUpdateError(applyUpdate)
    }, 15_000)
    try {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' })
    } catch {
      clearTimeout(activationTimeout)
      applying = false
      onUpdateError(applyUpdate)
    }
  }

  const notifyUpdate = (reoffer = false) => {
    if (!disposed && !applying && (!notified || reoffer) &&
        (needsReload || (registration?.waiting && registration.active))) {
      notified = true
      onUpdateReady(applyUpdate)
    }
  }

  const onControllerChange = () => {
    if (applying) {
      clearTimeout(activationTimeout)
      reload()
    } else if (hadController) {
      // Another tab accepted the update. Preserve this tab's unsaved inputs.
      needsReload = true
      notified = false
      notifyUpdate()
    }
    hadController = !!workers.controller
  }

  const watchInstalling = () => {
    const worker = registration?.installing
    if (!worker || watchedWorkers.has(worker)) return
    const onStateChange = () => {
      if (worker.state === 'installed') {
        notified = false
        notifyUpdate()
      }
    }
    watchedWorkers.set(worker, onStateChange)
    worker.addEventListener('statechange', onStateChange)
  }

  const checkUpdate = () => {
    if (disposed || document.visibilityState !== 'visible') return
    notifyUpdate()
    if (!registration || checking || !navigator.onLine) return
    checking = true
    void registration.update().catch(() => {
      // A failed background check must not interrupt normal use; retry on resume.
    }).finally(() => { checking = false })
  }

  const onResume = () => {
    // Reoffer a dismissed notification on resume, not on every background check.
    if (document.visibilityState === 'visible') notifyUpdate(true)
    checkUpdate()
  }

  workers.addEventListener('controllerchange', onControllerChange)
  document.addEventListener('visibilitychange', onResume)
  window.addEventListener('online', onResume)
  window.addEventListener('pageshow', onResume)
  const interval = setInterval(checkUpdate, 5 * 60_000)

  void workers.register('/sw.js', { scope: '/', updateViaCache: 'none' }).then((result) => {
    if (disposed) return
    registration = result
    registration.addEventListener('updatefound', watchInstalling)
    watchInstalling()
    checkUpdate()
  }).catch(() => {
    // Browsers which disallow registration can still use the ordinary website.
  })

  return () => {
    disposed = true
    clearInterval(interval)
    clearTimeout(activationTimeout)
    workers.removeEventListener('controllerchange', onControllerChange)
    document.removeEventListener('visibilitychange', onResume)
    window.removeEventListener('online', onResume)
    window.removeEventListener('pageshow', onResume)
    registration?.removeEventListener('updatefound', watchInstalling)
    for (const [worker, listener] of watchedWorkers) {
      worker.removeEventListener('statechange', listener)
    }
  }
}
