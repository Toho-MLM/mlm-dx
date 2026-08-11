'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

const ADMIN_MODE_COOKIE = 'mlm-dx-admin-mode'
const ADMIN_MODE_EVENT = 'mlm-dx-admin-mode-change'

type AdminModeChangeEvent = CustomEvent<{ enabled: boolean }>

export function useAdminMode(canUseAdminMode: boolean | null | undefined = true, initialValue: boolean = false) {
  const router = useRouter()
  const [storedAdminMode, setStoredAdminMode] = useState(initialValue)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const value = document.cookie.split('; ').find((item) => item.startsWith(`${ADMIN_MODE_COOKIE}=`))?.split('=')[1]
    setStoredAdminMode(value === 'true')

    const handleAdminModeChange = (event: Event) => {
      setStoredAdminMode((event as AdminModeChangeEvent).detail.enabled)
    }

    window.addEventListener(ADMIN_MODE_EVENT, handleAdminModeChange)

    return () => {
      window.removeEventListener(ADMIN_MODE_EVENT, handleAdminModeChange)
    }
  }, [])

  const setAdminMode = useCallback((enabled: boolean) => {
    setStoredAdminMode(enabled)
    if (typeof window === 'undefined') return
    const secure = window.location.protocol === 'https:' ? '; Secure' : ''
    document.cookie = `${ADMIN_MODE_COOKIE}=${String(enabled)}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`
    window.dispatchEvent(new CustomEvent(ADMIN_MODE_EVENT, { detail: { enabled } }))
    router.refresh()
  }, [router])

  return [Boolean(canUseAdminMode && storedAdminMode), setAdminMode] as const
}
