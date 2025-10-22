'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { useAuth } from '@/app/context/AuthContext'

export default function CallbackPage() {
  const router = useRouter()
  const { user, loading } = useAuth()

  useEffect(() => {
    if (!loading) {
      if (user) {
        router.replace('/')
      } else {
        router.replace('/login')
      }
    }
  }, [user, loading, router])

  return <div className="min-h-screen flex items-center justify-center">認証中...</div>
}