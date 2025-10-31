'use client'

import { AuthProvider } from '@/app/context/AuthContext'

export default function CallbackLayout({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>
}
