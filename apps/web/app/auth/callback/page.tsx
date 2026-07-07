'use client'

import { Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect } from 'react'
import { useAuth } from '@/app/context/AuthContext'
import { Skeleton } from '@/components/ui/skeleton'
import { consumeStoredRedirectPath } from '@/lib/auth-redirect'

function CallbackContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading } = useAuth()

  useEffect(() => {
    if (!loading) {
      const error = searchParams.get('error')
      if (error) {
        router.replace(`/login?error=${encodeURIComponent(error)}`)
      } else if (user) {
        router.replace(consumeStoredRedirectPath('/'))
      } else {
        router.replace('/login')
      }
    }
  }, [user, loading, router, searchParams])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md p-6">
        <div className="space-y-3">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    </div>
  )
}

export default function CallbackPage() {
  return (
    <Suspense fallback={null}>
      <CallbackContent />
    </Suspense>
  )
}
