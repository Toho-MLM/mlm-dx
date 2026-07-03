'use client'

import { useCallback, useEffect, useState } from 'react'

const ADMIN_MODE_STORAGE_KEY = 'mlm-dx-admin-mode'
const ADMIN_MODE_EVENT = 'mlm-dx-admin-mode-change'

type AdminModeChangeEvent = CustomEvent<{ enabled: boolean }>

export function useAdminMode(canUseAdminMode: boolean | null | undefined = true) {
  const [storedAdminMode, setStoredAdminMode] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    setStoredAdminMode(window.localStorage.getItem(ADMIN_MODE_STORAGE_KEY) === 'true')

    const handleStorage = (event: StorageEvent) => {
      if (event.key === ADMIN_MODE_STORAGE_KEY) {
        setStoredAdminMode(event.newValue === 'true')
      }
    }

    const handleAdminModeChange = (event: Event) => {
      setStoredAdminMode((event as AdminModeChangeEvent).detail.enabled)
    }

    window.addEventListener('storage', handleStorage)
    window.addEventListener(ADMIN_MODE_EVENT, handleAdminModeChange)

    return () => {
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener(ADMIN_MODE_EVENT, handleAdminModeChange)
    }
  }, [])

  const setAdminMode = useCallback((enabled: boolean) => {
    setStoredAdminMode(enabled)
    if (typeof window === 'undefined') return
    window.localStorage.setItem(ADMIN_MODE_STORAGE_KEY, String(enabled))
    window.dispatchEvent(new CustomEvent(ADMIN_MODE_EVENT, { detail: { enabled } }))
  }, [])

  return [Boolean(canUseAdminMode && storedAdminMode), setAdminMode] as const
}
