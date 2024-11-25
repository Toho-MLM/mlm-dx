'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { Loader2, LogOut, Pencil } from 'lucide-react'
import { motion } from 'framer-motion'
import { UserData, instrumentNames, roleNames } from '@/app/types'
import { useRouter } from 'next/navigation'
import { supabase } from '@/supabase/supabaseClient'

export function ProfilePage({ userData }: { userData: UserData }) {
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const router = useRouter()
  const handleLogout = async () => {
    setIsLoggingOut(true);
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Failed to logout:', error.message);
    } else {
      console.log('Logout success');
      window.location.reload(); // ページをリロードしてログアウトを反映
    }
    setIsLoggingOut(false);
  };

  const handleResetProfile = () => {
    router.push('/profile/setup')
  }

  return (
    <div className="pt-5 px-5">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <Card className="min-w-fit max-w-2xl mx-auto">
          <CardContent className="p-5 space-y-3">
            <div className="space-y-2">
              <div className="bg-gray-50 p-2 rounded-lg">
                <p className="text-xs font-medium text-gray-500">メールアドレス</p>
                <p className="text-sm font-semibold">{userData.email}</p>
              </div>
              <div className="bg-gray-50 p-2 rounded-lg">
                <p className="text-xs font-medium text-gray-500">学籍番号</p>
                <p className="text-sm font-semibold">{userData.student_number}</p>
              </div>
              <div className="bg-gray-50 p-2 rounded-lg">
                <p className="text-xs font-medium text-gray-500">学年</p>
                <p className="text-sm font-semibold">{userData.grade}年</p>
              </div>
              <div className="bg-gray-50 p-2 rounded-lg">
                <p className="text-xs font-medium text-gray-500">氏名</p>
                <p className="text-sm font-semibold">{userData.name}</p>
              </div>
              <div className="bg-gray-50 p-2 rounded-lg">
                <p className="text-xs font-medium text-gray-500">ニックネーム</p>
                <p className="text-sm font-semibold">{userData.nickname}</p>
              </div>
              <div className="bg-gray-50 p-2 rounded-lg">
                <p className="text-xs font-medium text-gray-500">役職</p>
                <p className="text-sm font-semibold">{roleNames[userData.role]}</p>
              </div>
              <div className="bg-gray-50 p-2 rounded-lg">
                <p className="text-xs font-medium text-gray-500">担当楽器</p>
                <p className="text-sm font-semibold">{userData.instruments.map((i) => instrumentNames[i]).join(', ')}</p>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex justify-between space-x-5">
            <Button
              onClick={handleResetProfile}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              size="sm"
            >
              <Pencil className="h-4 w-4" />
              編集
            </Button>
            <Button
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="bg-red-500 text-white hover:bg-red-600"
              size="sm"
            >
              <div className="flex items-center justify-center">
                {isLoggingOut && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <LogOut className="mr-2 h-4 w-4" />
                ログアウト
              </div>
            </Button>
          </CardFooter>
        </Card>
      </motion.div>
    </div>
  )
}