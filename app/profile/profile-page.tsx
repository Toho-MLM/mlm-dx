'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { LogOut, Settings } from 'lucide-react'
import { motion } from 'framer-motion'
import { Instrument, UserData } from '@/app/types'

const instrumentNames: Record<Instrument, string> = {
  [Instrument.VOCAL]: 'ボーカル',
  [Instrument.KEYBOARD]: 'キーボード',
  [Instrument.GUITAR]: 'ギター',
  [Instrument.DRUM]: 'ドラム',
  [Instrument.BASS]: 'ベース',
}

export function ProfilePage({ userData }: { userData: UserData }) {
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  const handleLogout = async () => {
    setIsLoggingOut(true)
    // ここに実際のログアウト処理を追加します
    await new Promise(resolve => setTimeout(resolve, 1000)) // ログアウト処理のシミュレーション
    setIsLoggingOut(false)
    // ログアウト後のリダイレクト処理をここに追加します
  }

  const handleResetProfile = () => {
    // ここにプロフィール再設定ページへの遷移処理を追加します
    console.log('プロフィール再設定ページへ遷移')
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <Card className="w-full max-w-md mx-auto">
        <CardHeader className="pb-4">
          <CardTitle className="text-xl font-bold">プロフィール</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 py-4">
          <div className="space-y-2">
            <div className="bg-gray-50 p-2 rounded-lg">
              <p className="text-xs font-medium text-gray-500">名前</p>
              <p className="text-sm font-semibold">{userData.name}</p>
            </div>
            <div className="bg-gray-50 p-2 rounded-lg">
              <p className="text-xs font-medium text-gray-500">学籍番号</p>
              <p className="text-sm font-semibold">{userData.student_number}</p>
            </div>
            <div className="bg-gray-50 p-2 rounded-lg">
              <p className="text-xs font-medium text-gray-500">メールアドレス</p>
              <p className="text-sm font-semibold">{userData.email}</p>
            </div>
            <div className="bg-gray-50 p-2 rounded-lg">
              <p className="text-xs font-medium text-gray-500">ニックネーム</p>
              <p className="text-sm font-semibold">{userData.nickname}</p>
            </div>
            <div className="bg-gray-50 p-2 rounded-lg">
              <p className="text-xs font-medium text-gray-500">担当楽器</p>
              <p className="text-sm font-semibold">{userData.instruments.map((i) => instrumentNames[i]).join(', ')}</p>
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-between pt-4 pb-6">
          <Button
            onClick={handleResetProfile}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            size="sm"
          >
            <Settings className="mr-2 h-4 w-4" />
            プロフィール再設定
          </Button>
          <Button
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="bg-red-500 text-white hover:bg-red-600"
            size="sm"
          >
            {isLoggingOut ? (
              <>
                <motion.div
                  className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                />
                ログアウト中...
              </>
            ) : (
              <>
                <LogOut className="mr-2 h-4 w-4" />
                ログアウト
              </>
            )}
          </Button>
        </CardFooter>
      </Card>
    </motion.div>
  )
}