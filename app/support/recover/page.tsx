"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Loader2, MailCheck, MailWarning } from "lucide-react"
import { supabase } from "@/supabase/supabaseClient"

export default function Page() {
  const [email, setEmail] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle")
  const [errorMessage, setErrorMessage] = useState("")
  const [countdown, setCountdown] = useState<number>(0)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!email.includes('@st.toho-u.ac.jp')) {
      setStatus("error")
      setErrorMessage("メールアドレスには@st.toho-u.ac.jpを含める必要があります。")
      return
    }

    setIsLoading(true)
    setStatus("idle")
    setErrorMessage("")

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/`,
      })
      if (error) throw error
      setStatus("success")
      setCountdown(3)
    } catch (error) {
      console.error(error)
      setStatus("error")
      setErrorMessage("パスワードリセットメールの送信に失敗しました。もう一度お試しください。")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (status === "success") {
      if (countdown === 0) {
        router.push("/login")
      } else {
        const timer = setTimeout(() => setCountdown(countdown - 1), 1000)
        return () => clearTimeout(timer)
      }
    }
  }, [status, countdown, router])

  return (
    <div className="pt-5 px-10">
        <Card className="w-full max-w-md overflow-hidden mx-auto">
          <CardHeader className="bg-gray-800 text-white">
            <CardTitle className="text-2xl font-bold">アカウント復元</CardTitle>
            <CardDescription className="text-gray-300">大学から付与されたメールアドレスを入力してください。</CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="mt-6 space-y-4">
              <div className="space-y-2">
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
              <AnimatePresence>
                {status === "success" && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <Alert className="bg-green-50 text-green-800 border-green-300">
                      <MailCheck className="h-4 w-4" />
                      <AlertTitle>送信完了</AlertTitle>
                      <AlertDescription>
                        パスワードリセットのメールを送信しました。メールをご確認ください。
                        {countdown > 0 && (
                          <div className="mt-2 text-sm">
                            あと {countdown} 秒でログイン画面に戻ります。
                          </div>
                        )}
                      </AlertDescription>
                    </Alert>
                  </motion.div>
                )}
                {status === "error" && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <Alert variant="destructive" className="bg-red-50 text-red-800 border-red-300">
                      <MailWarning className="h-4 w-4" />
                      <AlertTitle>エラー</AlertTitle>
                      <AlertDescription>{errorMessage}</AlertDescription>
                    </Alert>
                  </motion.div>
                )}
              </AnimatePresence>
            </CardContent>
            <CardFooter className="flex flex-col items-center space-y-2">
              <Button
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 rounded-md transition duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
                type="submit"
                disabled={isLoading}
              >
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                アカウント復元メールを送信
              </Button>
              <Button
                variant="link"
                className="text-sm text-blue-600 hover:text-blue-800"
                onClick={() => router.push("/login")}
              >
                ログインに戻る
              </Button>
            </CardFooter>
          </form>
        </Card>
    </div>
  )
}

