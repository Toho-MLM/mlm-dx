/* eslint-disable react-hooks/exhaustive-deps */
'use client'

import React, { useState, useEffect} from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { MailCheck, MailWarning, Loader2 } from 'lucide-react'
import { supabase } from '@/supabase/supabaseClient'
import { useRouter } from 'next/navigation'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"

export function LoginPage() {
  // -----------------------------
  // States & Refs
  // -----------------------------
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [cooldownEndTime, setCooldownEndTime] = useState<number | null>(null)
  const [remainingTime, setRemainingTime] = useState(0)
  const [errorMessage, setErrorMessage] = useState('エラーが発生しました。\nもう一度お試しください。')
  const [activeTab, setActiveTab] = useState<"otp" | "password">("otp")
  const [password, setPassword] = useState("")
  const [otp, setOTP] = useState("")

  // -----------------------------
  // Effects
  // -----------------------------
  // ローカルストレージから状態を復元
  useEffect(() => {
    const storedState = localStorage.getItem('magicLinkState')
    if (storedState) {
      const { status, cooldownEndTime, errorMessage: storedErrorMessage } = JSON.parse(storedState)
      setStatus(status)
      setCooldownEndTime(cooldownEndTime)
      if (status === 'error' && storedErrorMessage) {
        setErrorMessage(storedErrorMessage)
      }
    }
  }, [])

  // クールダウンのタイマー設定
  useEffect(() => {
    const timer = setInterval(() => {
      if (cooldownEndTime) {
        const remaining = Math.max(0, cooldownEndTime - Date.now())
        setRemainingTime(remaining)
        if (remaining === 0) {
          setStatus('idle')
          setCooldownEndTime(null)
        }
      }
    }, 100)

    return () => clearInterval(timer)
  }, [cooldownEndTime])

  // 状態をローカルストレージに保存
  useEffect(() => {
    const stateToStore: { status: string; cooldownEndTime: number | null; errorMessage?: string } = { status, cooldownEndTime }
    if (status === 'error') {
      stateToStore.errorMessage = errorMessage
    }
    if (status !== 'idle' || cooldownEndTime) {
      localStorage.setItem('magicLinkState', JSON.stringify(stateToStore))
    } else {
      localStorage.removeItem('magicLinkState')
    }
  }, [status, cooldownEndTime, errorMessage])

  // ログイン済みユーザーのチェックとページの可視性変更時の再チェック
  useEffect(() => {
    const checkUserSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        router.push('/')
      }
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkUserSession()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    checkUserSession()

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  // -----------------------------
  // Helper Functions
  // -----------------------------
  const handleAuthError = (error: { message: string; status?: number }) => {
    switch (error.status) {
      case 403:
        setErrorMessage('この機能を利用するための必要な権限がありません。\n管理者にお問い合わせください。')
        break
      case 422:
        setErrorMessage('このメールアドレスは登録されていません。\nメールアドレスが正しい場合はアカウント復元をお試しください。')
        break
      case 429:
        setErrorMessage('アクセスが多すぎます。\nしばらくしてから再試行してください。')
        break
      case 500:
        setErrorMessage('内部エラーが発生しました。\nしばらくしてから再試行してください。')
        break
      case 501:
        setErrorMessage('この機能はサーバーで有効になっていません。\n管理者にお問い合わせください。')
        break
      default:
        setErrorMessage('予期せぬエラーが発生しました。\n' + error.message)
        break
    }
  }

  const sendOTP = async () => {
    const { error } = await supabase.auth.signInWithOtp({ email })
    if (error) {
      handleAuthError(error)
      throw new Error(error.message)
    }
  }

  const verifyOTP = async () => {
    const { error, data } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: "email"
    })
    if (error) {
      handleAuthError(error)
      throw new Error(error.message)
    }
    return data
  }

  const signInWithPassword = async () => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    })
    if (error) {
      if (error.code === 'invalid_credentials') {
        setStatus('error')
        setErrorMessage('パスワードが間違っています。')
      } else {
        handleAuthError(error)
      }
      throw new Error(error.message)
    }
  }

  // 円形プログレス表示用コンポーネント
  function CircularProgress({ remainingSeconds }: { remainingSeconds: number }) {
    const baseSeconds = status === 'success' ? 60 : 10
    const progress = ((baseSeconds - remainingSeconds) / baseSeconds) * 100
    const circumference = 2 * Math.PI * 18
    return (
      <div className="relative inline-flex flex-col items-center justify-center">
        <div className="w-10 h-10 relative">
          <svg className="w-10 h-10 transform -rotate-90">
            <circle
              className="text-gray-300"
              strokeWidth="3"
              stroke="currentColor"
              fill="transparent"
              r="18"
              cx="20"
              cy="20"
            />
            <circle
              className="text-blue-600 transition-[stroke-dashoffset] ease-in-out"
              strokeWidth="3"
              strokeDasharray={circumference}
              strokeDashoffset={circumference - (progress / 100) * circumference}
              strokeLinecap="round"
              stroke="currentColor"
              fill="transparent"
              r="18"
              cx="20"
              cy="20"
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-blue-600">
            {remainingSeconds}
          </span>
        </div>
        <span className="text-[10px] mt-1 text-gray-500 whitespace-nowrap">再送信可能まで</span>
      </div>
    )
  }

  // -----------------------------
  // Event Handlers
  // -----------------------------
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!email.includes('@st.toho-u.ac.jp')) {
      setStatus('error')
      setErrorMessage('メールアドレスには@st.toho-u.ac.jpを含める必要があります。')
      return
    }
    setIsLoading(true)
    setStatus('idle')
    try {
      if (activeTab === "otp") {
        if (otp.length === 6) {
          // OTPが入力されている場合、OTPを検証する
          await verifyOTP()
          router.push('/')
        } else {
          // OTPが未入力の場合はOTPを送信する
          await sendOTP()
          setStatus('success')
          setCooldownEndTime(Date.now() + 60000)
        }
      } else {
        await signInWithPassword()
        router.push('/')
      }
    } catch (error: unknown) {
      setStatus('error')
      console.error(error)
      if (activeTab === "otp") {
        setCooldownEndTime(Date.now() + 10000)
      }
    } finally {
      setIsLoading(false)
    }
  }

  // -----------------------------
  // Render
  // -----------------------------
  const isButtonDisabled = isLoading || (cooldownEndTime !== null && Date.now() < cooldownEndTime && !(activeTab === 'otp' && otp.length === 6))

  return (
    <div className="pt-5 px-10">
      <Card className="w-full max-w-xl overflow-hidden mx-auto">
        <CardHeader className="bg-gray-800 text-white">
          <CardTitle className="text-2xl font-bold">ログイン</CardTitle>
          <CardDescription className="text-gray-300">
            大学から付与されたメールアドレスを入力してください。
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="mt-2 space-y-4">
            <div className="space-y-1">
              <Label htmlFor="email" className="text-sm font-medium text-gray-700">
                メールアドレス
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="example@st.toho-u.ac.jp"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="rounded-md border-gray-300 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
              />
            </div>
            <Tabs
              value={activeTab}
              onValueChange={(value) => {
                const newTab = value as "otp" | "password";
                setActiveTab(newTab);
                if(newTab === "password") {
                  // パスワードタブに切り替えた際はエラーステータスをリセットして初期状態にする
                  setStatus('idle');
                }
              }}
              className="w-full"
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="otp">確認コード</TabsTrigger>
                <TabsTrigger value="password">パスワード</TabsTrigger>
              </TabsList>
              <TabsContent value="otp">
                {status === "success" && (
                  <div className="space-y-4">
                    <Label htmlFor="otp" className="text-sm font-medium text-gray-700">
                      メールアドレスに送信された6桁のコードを入力してください
                    </Label>
                    <InputOTP value={otp} onChange={setOTP} maxLength={6} className='justify-center'>
                      <InputOTPGroup>
                        <InputOTPSlot index={0} />
                        <InputOTPSlot index={1} />
                        <InputOTPSlot index={2} />
                        <InputOTPSlot index={3} />
                        <InputOTPSlot index={4} />
                        <InputOTPSlot index={5} />
                      </InputOTPGroup>
                    </InputOTP>
                  </div>
                )}
              </TabsContent>
              <TabsContent value="password">
                <div className="space-y-2">
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="rounded-md"
                  />
                  <p className="text-sm text-gray-500">パスワードをお忘れの場合は、確認コードでログイン後、再設定してください。</p>
                </div>
              </TabsContent>
            </Tabs>
            <AnimatePresence>
              {status !== 'idle' && ((activeTab === 'otp' && cooldownEndTime) || activeTab === 'password') && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  {status === 'success' && activeTab === 'otp' && (
                    <Alert className="bg-green-50 text-green-800 border-green-300 relative pr-20">
                      <div className="absolute top-3 right-3">
                        <CircularProgress remainingSeconds={Math.max(0, Math.ceil(remainingTime / 1000))} />
                      </div>
                      <div className="flex items-start gap-1">
                        <MailCheck className="h-5 w-5 relative top-[-4px] left-[-4px]" />
                        <div>
                          <AlertTitle>送信完了</AlertTitle>
                          <AlertDescription>
                            <>
                              確認コードをメールで送信しました。
                              <br />
                              迷惑メールボックスもご確認ください。
                            </>
                          </AlertDescription>
                        </div>
                      </div>
                    </Alert>
                  )}
                  {status === 'error' && (
                    <Alert className="bg-red-50 text-red-800 border-red-300 relative pr-24">
                      {activeTab === "otp" && (
                        <div className="absolute top-3 right-3">
                          <CircularProgress remainingSeconds={Math.max(0, Math.ceil(remainingTime / 1000))} />
                        </div>
                      )}
                      <div className="flex items-start gap-1">
                        <MailWarning className="h-5 w-5 flex-shrink-0 relative top-[-4px] left-[-4px]" />
                        <div>
                          <AlertTitle>エラー</AlertTitle>
                          <AlertDescription>
                            {errorMessage.split("\n").map((line, index) => (
                              <React.Fragment key={index}>
                                {line}
                                <br />
                              </React.Fragment>
                            ))}
                          </AlertDescription>
                        </div>
                      </div>
                    </Alert>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </CardContent>
          <CardFooter className="flex flex-col items-center space-y-2">
            <Button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-md transition duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
              disabled={isButtonDisabled}
            >
              <div className="flex items-center justify-center">
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {activeTab === "otp" ? (otp.length === 6 ? "確認コードを認証" : "確認コードを送信") : "ログイン"}
              </div>
            </Button>
            <Button
              variant="link"
              className="text-sm text-blue-600 hover:text-blue-800"
              onClick={() => router.push("/support/recover")}
            >
              ログインできない場合
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}