'use client'

import React, { useEffect } from 'react'
import { motion } from 'framer-motion'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Loader2, Chrome } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { apiClient } from '@/lib/api'

export function LoginPage() {
  const router = useRouter()
  const [status, setStatus] = React.useState<'loading' | 'authenticated' | 'unauthenticated'>('loading')
  const [isLoading, setIsLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  useEffect(() => {
    (async () => {
      const s = await apiClient.getSession()
      setStatus(s ? 'authenticated' : 'unauthenticated')
      if (s) router.push('/')
    })()
  }, [router])

  const handleGoogleLogin = async () => {
    setIsLoading(true)
    setError(null)
    
    try {
      const authUrl = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787'}/api/auth/signin/google`
      window.location.href = authUrl
    } catch (error) {
      console.error('Login failed:', error)
      setError('ログインに失敗しました。もう一度お試しください。')
    } finally {
      setIsLoading(false)
    }
  }

  // セッション読み込み中
  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex items-center space-x-2">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>読み込み中...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <Card className="overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-blue-600 to-blue-700 text-white text-center">
            <CardTitle className="text-2xl font-bold">MLM-DX</CardTitle>
            <CardDescription className="text-blue-100">
              バンド管理システムにログイン
            </CardDescription>
          </CardHeader>
          
          <CardContent className="p-6 space-y-6">
            <div className="text-center space-y-4">
              <div className="space-y-2">
                <h2 className="text-lg font-semibold text-gray-900">
                  ログイン
                </h2>
                <p className="text-sm text-gray-600">
                  Googleアカウントでログインして、バンド管理を始めましょう
                </p>
              </div>

              {error && (
                <Alert className="bg-red-50 text-red-800 border-red-300">
                  <AlertTitle>エラー</AlertTitle>
                  <AlertDescription>
                    {error}
                  </AlertDescription>
                </Alert>
              )}

              <Button
                onClick={handleGoogleLogin}
                disabled={isLoading}
                className="w-full bg-white hover:bg-gray-50 text-gray-900 border border-gray-300 font-medium py-3 px-4 rounded-md transition duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
              >
                <div className="flex items-center justify-center space-x-3">
                  {isLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Chrome className="h-5 w-5" />
                  )}
                  <span>
                    {isLoading ? 'ログイン中...' : 'Googleでログイン'}
                  </span>
                </div>
              </Button>
            </div>

            <div className="text-center">
              <p className="text-xs text-gray-500">
                ログインすることで、
                <a href="#" className="text-blue-600 hover:text-blue-800 underline">
                  利用規約
                </a>
                および
                <a href="#" className="text-blue-600 hover:text-blue-800 underline">
                  プライバシーポリシー
                </a>
                に同意したものとみなされます。
              </p>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}