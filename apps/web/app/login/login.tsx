'use client'

import { signIn } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Chrome } from 'lucide-react'
import { useAuth } from '@/app/context/AuthContext'

export function LoginPage() {
  const router = useRouter()
  const { user, loading } = useAuth()

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">読み込み中...</div>
  }

  if (user) {
    router.push('/')
    return null
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-center">MLM DX ログイン</CardTitle>
        </CardHeader>
        <CardContent>
          <Button
            onClick={() => signIn()}
            className="w-full bg-white hover:bg-gray-50 text-gray-900 border border-gray-300"
          >
            <Chrome className="h-5 w-5 mr-2" />
            Googleでログイン
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}