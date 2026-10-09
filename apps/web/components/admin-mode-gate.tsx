'use client'

import { useEffect, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/app/context/AuthContext'
import { useAdminMode } from '@/hooks/use-admin-mode'
import { isAdmin } from '@shared-schemas'

export function AdminModeGate({ children }: { children: ReactNode }) {
  const router = useRouter()
  const { user } = useAuth()
  const [isAdminMode] = useAdminMode(user && isAdmin(user.role))

  useEffect(() => {
    if (!isAdminMode) router.replace('/')
  }, [isAdminMode, router])

  return isAdminMode ? children : null
}
