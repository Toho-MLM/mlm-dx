import type { ReactNode } from 'react'
import { requireServerAdmin } from '@/lib/server-api'

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireServerAdmin()
  return children
}
