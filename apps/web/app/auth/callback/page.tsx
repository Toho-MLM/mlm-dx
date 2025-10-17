'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function CallbackPage() {
  const router = useRouter()

  useEffect(() => {
    const url = new URL(window.location.href)
    const token = url.searchParams.get('token')
    const redirect = url.searchParams.get('redirect') || '/'
    if (token) {
      const isSecure = window.location.protocol === 'https:'
      const sameSite = 'Lax'
      document.cookie = `auth_token=${token}; Path=/; ${isSecure ? 'Secure; ' : ''}SameSite=${sameSite}; Max-Age=${60 * 60 * 24 * 30}`
      router.replace(redirect)
    } else {
      router.replace('/login')
    }
  }, [router])

  return null
}


