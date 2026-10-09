'use client'

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'

const ADMIN_MODE_COOKIE = 'mlm-dx-admin-mode'
const AdminModeContext = createContext<readonly [boolean, (enabled: boolean) => void] | null>(null)

export function AdminModeProvider({ children, initialValue }: { children: ReactNode; initialValue: boolean }) {
  const router = useRouter()
  const [enabled, setEnabled] = useState(initialValue)

  useEffect(() => {
    const value = document.cookie.split('; ').find((item) => item.startsWith(`${ADMIN_MODE_COOKIE}=`))?.split('=')[1]
    setEnabled(value === 'true')
  }, [initialValue])

  const setAdminMode = useCallback((value: boolean) => {
    setEnabled(value)
    const secure = window.location.protocol === 'https:' ? '; Secure' : ''
    document.cookie = `${ADMIN_MODE_COOKIE}=${String(value)}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`
    router.refresh()
  }, [router])

  return <AdminModeContext.Provider value={[enabled, setAdminMode]}>{children}</AdminModeContext.Provider>
}

export function useAdminModeContext() {
  const context = useContext(AdminModeContext)
  if (!context) throw new Error('useAdminMode must be used within an AdminModeProvider')
  return context
}
