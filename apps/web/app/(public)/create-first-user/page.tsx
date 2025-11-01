'use client'

import { useRouter } from 'next/navigation'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LoadingButton } from "@/components/ui/loading-button"
import { apiClient } from '@/lib/api'
import { toast } from 'sonner'
import { translateError } from '@/lib/error-label'
import { useEffect, useState } from 'react'
import { Skeleton } from '@/components/ui/skeleton'

export default function CreateFirstUserPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [grade, setGrade] = useState<number | ''>('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    const checkCanCreate = async () => {
      try {
        const result = await apiClient.checkFirstUser()
        if (!result.canCreate) {
          router.push('/')
        } else {
          setIsLoading(false)
        }
      } catch (error) {
        console.error('Error checking first user:', error)
        toast.error('初期チェック中にエラーが発生しました')
        setIsLoading(false)
      }
    }

    checkCanCreate()
  }, [router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)

    if (!name.trim()) {
      setErrorMessage('名前を入力してください')
      return
    }

    if (!email.trim()) {
      setErrorMessage('メールアドレスを入力してください')
      return
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      setErrorMessage('有効なメールアドレスを入力してください')
      return
    }

    if (!grade || grade < 1 || grade > 6) {
      setErrorMessage('学年は1から6の間で入力してください')
      return
    }

    setIsSubmitting(true)
    try {
      await apiClient.createFirstUser({
        name: name.trim(),
        email: email.trim(),
        grade: Number(grade),
      })
      toast.success('最初のユーザーが作成されました。')
      setTimeout(() => {
        router.push('/login')
      }, 1000)
    } catch (error) {
      const errorMessage = (error as Error).message
      const translated = translateError(errorMessage)
      setErrorMessage(translated)
      toast.error(translated)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md overflow-hidden">
          <CardHeader className="bg-gray-800 text-white pb-4">
            <CardTitle className="text-center text-2xl font-bold">セットアップ</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md overflow-hidden">
        <CardHeader className="bg-gray-800 text-white pb-4">
          <CardTitle className="text-center text-2xl font-bold">セットアップ</CardTitle>
          <div className="mx-auto mt-1 w-full">
            <div className="text-gray-300 text-sm text-center">
              管理者ユーザーを作成してください
            </div>
          </div>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="p-4">
            <div className="space-y-4">
              {errorMessage && (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {errorMessage}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="name">名前</Label>
                <Input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="山田 太郎"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">メールアドレス</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="example@university.ac.jp"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="grade">学年</Label>
                <Input
                  id="grade"
                  type="number"
                  min="1"
                  max="6"
                  value={grade}
                  onChange={(e) => setGrade(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="1"
                  required
                />
              </div>
            </div>
          </CardContent>
          <CardFooter className="p-4 pt-0">
            <LoadingButton
              type="submit"
              isLoading={isSubmitting}
              className="w-full"
              size="lg"
            >
              作成
            </LoadingButton>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
