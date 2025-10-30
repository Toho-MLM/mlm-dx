'use client'

import { useState, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { motion } from 'framer-motion'
import { UserData, instrumentNames, roleNames, Role, Instrument } from '@/app/types'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/app/context/AuthContext'
import { SetupWizard } from './setup-wizard'
import { PageHeader } from '@/components/page-header'
import { apiClient } from '@/lib/api'
import { Skeleton } from '@/components/ui/skeleton'

export function ProfilePage() {
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [userData, setUserData] = useState<UserData | null>(null)
  const router = useRouter()
  const { signOut, user, loading: authLoading } = useAuth()

  useEffect(() => {
    const init = async () => {
      if (authLoading) return
      if (!user) {
        router.push('/login')
        return
      }
      try {
        const res = await apiClient.getCurrentUserData()
        if (res.success && res.data) {
          const anyData = res.data as any
          const ud: UserData = {
            grade: res.data.grade,
            name: res.data.name ?? '',
            role: res.data.role as Role,
            email: res.data.email,
            nickname: res.data.nickname,
            instruments: res.data.instruments as Instrument[],
            student_number: anyData?.student_number
          }
          setUserData(ud)
        }
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [authLoading, user, router])
  
  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await signOut();
    } catch (error) {
      console.error('Failed to logout:', error);
    } finally {
      setIsLoggingOut(false);
    }
  };

  const handleResetProfile = useCallback(() => {
    setIsEditing(true)
  }, [])

  const handleEditComplete = useCallback((updatedData: UserData) => {
    setIsEditing(false)
    setUserData(updatedData)
  }, [router])

  if (!userData && !loading) {
    return null
  }

  if (isEditing && userData) {
    return <SetupWizard initialUserData={userData} onComplete={handleEditComplete} />
  }

  return (
    <div>
      {loading ? (
        <div className="px-5 pt-5">
          <div className="mb-5">
            <Skeleton className="h-8 w-40" />
          </div>
          <Card className="min-w-fit max-w-2xl mx-auto">
            <CardContent className="p-5 space-y-3">
              <div className="space-y-2">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-5 w-56" />
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-5 w-56" />
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-5 w-56" />
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-5 w-56" />
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <>
          <PageHeader 
            rightActions={
              <Button
                onClick={handleResetProfile}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
                size="sm"
              >
                編集
              </Button>
            }
          />
          <div className="pt-5 px-5">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className ="space-y-5"
            >
            <Card className="min-w-fit max-w-2xl mx-auto">
              <CardContent className="p-5 space-y-3">
                <div className="space-y-2">
                  <div className="bg-gray-50 p-2 rounded-lg">
                    <p className="text-xs font-medium text-gray-500">メールアドレス</p>
                    <p className="text-sm font-semibold">{userData!.email}</p>
                  </div>
                  <div className="bg-gray-50 p-2 rounded-lg">
                    <p className="text-xs font-medium text-gray-500">学籍番号</p>
                    <p className="text-sm font-semibold">{userData!.student_number}</p>
                  </div>
                  <div className="bg-gray-50 p-2 rounded-lg">
                    <p className="text-xs font-medium text-gray-500">学年</p>
                    <p className="text-sm font-semibold">{userData!.grade}年</p>
                  </div>
                  <div className="bg-gray-50 p-2 rounded-lg">
                    <p className="text-xs font-medium text-gray-500">氏名</p>
                    <p className="text-sm font-semibold">{userData!.name}</p>
                  </div>
                  <div className="bg-gray-50 p-2 rounded-lg">
                    <p className="text-xs font-medium text-gray-500">ニックネーム</p>
                    <p className="text-sm font-semibold">{userData!.nickname}</p>
                  </div>
                  <div className="bg-gray-50 p-2 rounded-lg">
                    <p className="text-xs font-medium text-gray-500">役職</p>
                    <p className="text-sm font-semibold">{roleNames[userData!.role]}</p>
                  </div>
                  <div className="bg-gray-50 p-2 rounded-lg">
                    <p className="text-xs font-medium text-gray-500">担当楽器</p>
                    <p className="text-sm font-semibold">{userData!.instruments.map((i) => instrumentNames[i]).join(', ')}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            </motion.div>
          </div>
        </>
      )}
    </div>
  )
}