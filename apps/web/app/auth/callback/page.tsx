'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function CallbackPage() {
  const router = useRouter()

  useEffect(() => {
    // Workers側の認証が完了した後、フロントエンドにリダイレクトされる
    // この時点でセッションクッキーが設定されているはず
    const checkAuth = async () => {
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787'}/api/auth/session`, {
          credentials: 'include',
        })
        
        if (response.ok) {
          const session = await response.json()
          if (session.user) {
            router.replace('/')
            return
          }
        }
      } catch (error) {
        console.error('Session check failed:', error)
      }
      
      // 認証に失敗した場合はログインページにリダイレクト
      router.replace('/login')
    }

    checkAuth()
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="flex items-center space-x-2">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
        <span>認証を確認中...</span>
      </div>
    </div>
  )
}


