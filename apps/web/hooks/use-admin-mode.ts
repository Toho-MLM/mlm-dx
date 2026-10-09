'use client'

import { useAdminModeContext } from '@/app/context/AdminModeContext'

export function useAdminMode(canUseAdminMode: boolean | null | undefined = true) {
  const [storedAdminMode, setAdminMode] = useAdminModeContext()
  return [Boolean(canUseAdminMode && storedAdminMode), setAdminMode] as const
}
