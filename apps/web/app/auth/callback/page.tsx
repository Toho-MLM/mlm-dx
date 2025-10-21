'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function CallbackPage() {
  const router = useRouter()
  const { data: session, status } = useSession()

  useEffect(() => {
    if (status === 'authenticated') router.replace('/')
    if (status === 'unauthenticated') router.replace('/login')
  }, [status, router])

  return <div className="min-h-screen flex items-center justify-center">認証中...</div>
}