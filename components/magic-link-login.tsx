'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { MailCheck, MailWarning, Loader2 } from 'lucide-react'

function CircularProgress({ remainingSeconds }: { remainingSeconds: number }) {
  const progress = ((60 - remainingSeconds) / 60) * 100
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
        <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-blue-600">{remainingSeconds}</span>
      </div>
      <span className="text-[10px] mt-1 text-gray-500 whitespace-nowrap">再送信可能まで</span>
    </div>
  )
}

async function sendMagicLink(email: string) {
  await new Promise(resolve => setTimeout(resolve, 1000))
  if (email === 'error@example.com') {
    throw new Error('Failed to send magic link')
  }
  return { success: true }
}

export function MagicLinkLogin() {
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [cooldownEndTime, setCooldownEndTime] = useState<number | null>(null)
  const [remainingTime, setRemainingTime] = useState(0)
  const lastSubmittedEmail = useRef('')

  useEffect(() => {
    const storedState = localStorage.getItem('magicLinkState')
    if (storedState) {
      const { status, cooldownEndTime } = JSON.parse(storedState)
      setStatus(status)
      setCooldownEndTime(cooldownEndTime)
    }
  }, [])

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

  useEffect(() => {
    if (status !== 'idle' || cooldownEndTime) {
      localStorage.setItem('magicLinkState', JSON.stringify({ status, cooldownEndTime }))
    } else {
      localStorage.removeItem('magicLinkState')
    }
  }, [status, cooldownEndTime])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setStatus('idle')

    try {
      await sendMagicLink(email)
      setStatus('success')
      lastSubmittedEmail.current = email
      setCooldownEndTime(new Date().getTime() + 60000)
    } catch (error) {
      setStatus('error')
      console.error(error)
      setCooldownEndTime(new Date().getTime() + 60000)
    } finally {
      setIsLoading(false)
    }
  }

  const isButtonDisabled = isLoading || (cooldownEndTime !== null && Date.now() < cooldownEndTime)

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <Card className="w-full max-w-md overflow-hidden">
          <CardHeader className="bg-gray-800 text-white">
          <CardTitle className="text-2xl font-bold">ログイン</CardTitle>
          <CardDescription className="text-gray-300">メールアドレスを入力してください。</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="mt-2 space-y-4">
            <div className="space-y-1">
              <Label htmlFor="email" className="text-sm font-medium text-gray-700">メールアドレス</Label>
              <Input
                id="email"
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="rounded-md border-gray-300 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
              />
            </div>
            <AnimatePresence>
              {status !== 'idle' && cooldownEndTime && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  {status === 'success' && (
                    <Alert className="bg-green-50 text-green-800 border-green-300 relative pr-24">
                      <div className="absolute top-3 right-3">
                        <CircularProgress remainingSeconds={Math.max(0, Math.ceil(remainingTime / 1000))} />
                      </div>
                      <div className="flex items-start gap-1">
                        <MailCheck className="h-5 w-5 relative top-[-4px] left-[-4px]" />
                        <div>
                          <AlertTitle >送信完了</AlertTitle>
                          <AlertDescription>
                            <>
                              マジックリンクをメールで送信しました。
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
                      <div className="absolute top-3 right-3">
                        <CircularProgress remainingSeconds={Math.max(0, Math.ceil(remainingTime / 1000))} />
                      </div>
                      <div className="flex items-start gap-1">
                        <MailWarning className="h-5 w-5 relative top-[-4px] left-[-4px]" />
                        <div>
                          <AlertTitle >エラー</AlertTitle>
                          <AlertDescription>
                            <>
                              送信に失敗しました。
                              <br />
                              メールアドレスを確認してもう一度お試しください。
                            </>
                          </AlertDescription>
                        </div>
                      </div>
                    </Alert>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </CardContent>
          <CardFooter className="flex flex-col items-center">
            <Button 
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-md transition duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50" 
              type="submit" 
              disabled={isButtonDisabled}
            >
              {isLoading ? (
                <div className="flex items-center justify-center">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  送信中...
                </div>
              ) : (
                'マジックリンクを送信'
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}