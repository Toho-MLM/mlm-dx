import React from 'react'
import { MainContent } from '../layout-client'
import { requireAuth } from '@/lib/server-api'
import type { User } from '@/app/types'

export default async function ProtectedLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  const serverUser = await requireAuth()
  const initialUser = serverUser as User | null

  return (
    <>{/* Protected shell with sidebar & auth */}
      <MainContent initialUser={initialUser}>{children}</MainContent>
    </>
  )
}


