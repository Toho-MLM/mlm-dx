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
import { Loader2, CheckCircle, XCircle } from "lucide-react"
import { supabase } from "@/supabase/supabaseClient"


export default function Page() {
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle")
  const [errorMessage, setErrorMessage] = useState("")
  const [countdown, setCountdown] = useState(0)
  const router = useRouter()

  // セッションチェック
  useEffect(() => {
    const handleAuthStateChange = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        // セッションがない場合はログインページにリダイレクト
        router.push("/login")
      }
    }
    handleAuthStateChange()
  }, [router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPassword !== confirmPassword) {
      setStatus("error")
      setErrorMessage("パスワードが一致しません。")
      return
    }
    const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{8,}$/
    if (!passwordRegex.test(newPassword)) {
      setStatus("error")
      setErrorMessage("パスワードは8文字以上の英数字を含む必要があります。")
      return
    }

    setIsLoading(true)
    setStatus("idle")
    setErrorMessage("")


    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      setStatus("success")
      // カウントダウンの初期値を3秒に設定し、1秒毎に更新
      setCountdown(3)
      const intervalId = setInterval(() => {
        setCountdown((prevCountdown) => {
          if (prevCountdown <= 1) {
            clearInterval(intervalId)
            router.push("/")
            return 0
          }
          return prevCountdown - 1
        })
      }, 1000)
    } catch (error) {
      // エラー内容をログに出力し、unused error を解消
      console.error("パスワード更新に失敗しました:", error)
      setStatus("error")
      setErrorMessage("パスワードの更新に失敗しました。もう一度お試しください。")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="pt-5 px-10">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <Card className="w-full max-w-md overflow-hidden mx-auto">
          <CardHeader className="bg-gray-800 text-white">
            <CardTitle className="text-2xl font-bold">パスワード変更</CardTitle>
            <CardDescription className="text-gray-300">新しいパスワードを入力してください。</CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="mt-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="newPassword" className="text-sm font-medium text-gray-700">
                  新しいパスワード
                </Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  disabled={status === "success"}
                  className="rounded-md border-gray-300 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-sm font-medium text-gray-700">
                  新しいパスワード（確認）
                </Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  disabled={status === "success"}
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
                      <CheckCircle className="h-4 w-4" />
                      <AlertTitle>成功</AlertTitle>
                      <AlertDescription>
                        パスワードが正常に更新されました。
                        {countdown > 0 && <span>{countdown}秒後に元のページに戻ります。</span>}
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
                      <XCircle className="h-4 w-4" />
                      <AlertTitle>エラー</AlertTitle>
                      <AlertDescription>{errorMessage}</AlertDescription>
                    </Alert>
                  </motion.div>
                )}
              </AnimatePresence>
            </CardContent>
            {status !== "success" && (
            <CardFooter className="flex flex-col items-center space-y-2">
                <Button
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-md transition duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
                type="submit"
                disabled={isLoading}
              >
                {isLoading ? (
                  <div className="flex items-center justify-center">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    更新中...
                  </div>
                ) : (
                  "パスワードを更新"
                )}
                </Button>
              </CardFooter>
            )}
          </form>
        </Card>
      </motion.div>
    </div>
  )
}
