import React from 'react'
import { headers } from 'next/headers'
import { MainContent } from '../layout-client'
import { getServerAdminMode, requireAuth } from '@/lib/server-api'

export const dynamic = 'force-dynamic'

export default async function ProtectedLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const requestPath = (await headers()).get('x-mlm-request-path') || undefined
  const user = await requireAuth(requestPath)
  const adminMode = await getServerAdminMode(user)

  return <MainContent initialUser={user} initialAdminMode={adminMode}>{children}</MainContent>
}
