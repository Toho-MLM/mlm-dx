'use client'

import React from 'react'
import { AuthProvider } from '@/app/context/AuthContext'

export default function PublicLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return <AuthProvider initialUser={null}>{children}</AuthProvider>
}


