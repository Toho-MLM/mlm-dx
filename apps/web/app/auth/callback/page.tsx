'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, Suspense } from 'react'
import { useAuth } from '@/app/context/AuthContext'
import LoadingScreen from '@/components/loading'

function CallbackContent() {
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

  return <LoadingScreen />
}

export default function CallbackPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <CallbackContent />
    </Suspense>
  )
}