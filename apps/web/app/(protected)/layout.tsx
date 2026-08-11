import React from 'react'
import { headers } from 'next/headers'
import { MainContent } from '../layout-client'
import { requireAuth } from '@/lib/server-api'

export const dynamic = 'force-dynamic'

export default async function ProtectedLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const requestPath = (await headers()).get('x-mlm-request-path') || undefined
  const user = await requireAuth(requestPath)

  return <MainContent initialUser={user}>{children}</MainContent>
}
