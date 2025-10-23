'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect } from 'react'
import { useAuth } from '@/app/context/AuthContext'

export default function CallbackPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading } = useAuth()

  useEffect(() => {
    if (!loading) {
      const error = searchParams.get('error')
      if (error) {
        router.replace(`/login?error=${error}`)
      } else if (user) {
        router.replace('/')
      } else {
        router.replace('/login')
      }
    }
  }, [user, loading, router, searchParams])

  return <div className="min-h-screen flex items-center justify-center">認証中...</div>
}