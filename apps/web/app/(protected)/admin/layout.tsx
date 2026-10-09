import type { ReactNode } from 'react'
import { requireServerAdmin } from '@/lib/server-api'
import { AdminModeGate } from '@/components/admin-mode-gate'

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireServerAdmin()
  return <AdminModeGate>{children}</AdminModeGate>
}
