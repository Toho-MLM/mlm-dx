'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from "@/components/ui/button"
import { LoadingButton } from "@/components/ui/loading-button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useAuth } from '@/app/context/AuthContext'
import { useEffect, useState } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { httpClient } from '@/lib/http-client'
import { toast } from 'sonner'
import { showSuccessToast } from '@/lib/utils'
import { translateError } from '@/lib/error-label'
import { startAuthentication } from '@simplewebauthn/browser'
import type { AuthenticatorAssertionResponseJSON } from '@simplewebauthn/types'
import { apiClient } from '@/lib/api'
import { InAppBrowserGuide } from '@/components/in-app-browser-guide'
import { clearStoredRedirectPath, consumeStoredRedirectPath, storeRedirectPath } from '@/lib/auth-redirect'

function detectInAppBrowser(ua: string) {
  const isIos = /iPhone|iPad|iPod/i.test(ua)
  const isAndroid = /Android/i.test(ua)
  const isMobile = isIos || isAndroid
  if (!isMobile) {
    return false
  }

  const iosWebView = isIos && /AppleWebKit/i.test(ua) && !/Safari/i.test(ua)
  const androidWebView = isAndroid && (/\bwv\b/i.test(ua) || /; wv\)/i.test(ua))
  const inAppTokens =
    /(FBAN|FBAV|Instagram|Line\/|LIFF|MicroMessenger|WeChat|TikTok|Snapchat|Pinterest|KAKAOTALK|Discord|GSA|YaApp_Android|YJApp-IOS|wv;|Messenger|Twitter)/i

  return iosWebView || androidWebView || inAppTokens.test(ua)
}

function LoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading } = useAuth()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isPasskeyLoading, setIsPasskeyLoading] = useState(false)
  const [showInAppGuide, setShowInAppGuide] = useState(false)

  useEffect(() => {
    const redirect = searchParams.get('redirect')
    if (redirect === null) return

    const storedRedirect = storeRedirectPath(redirect)
    if (!storedRedirect) {
      clearStoredRedirectPath()
    }
  }, [searchParams])

  useEffect(() => {
    const error = searchParams.get('error')
    if (error) {
      const errorMessages: Record<string, string> = {
        invalid_state: 'ログインの処理中に問題が発生しました。もう一度お試しください。',
        token_exchange_failed: 'ログインの処理中に問題が発生しました。もう一度お試しください。',
        invalid_id_token: 'ログインの処理中に問題が発生しました。もう一度お試しください。',
        failed_to_get_user_info: 'アカウント情報の取得に失敗しました。もう一度お試しください。',
        email_not_verified: 'Googleアカウントのメールアドレスが認証されていません。Googleアカウントの設定でメール認証を完了してから再度お試しください。',
        access_denied: 'このメールアドレスは利用できません。管理者にお問い合わせください。',
        authentication_failed: 'ログインに失敗しました。もう一度お試しください。'
      }
      const message = translateError(errorMessages[error] || 'ログイン中に問題が発生しました。もう一度お試しください。')
      setErrorMessage(message)
      toast.error(message)
    } else {
      setErrorMessage(null)
    }
  }, [searchParams])

  useEffect(() => {
    if (!loading && user) {
      router.push(consumeStoredRedirectPath('/'))
    }
  }, [user, loading, router])

  if (user) {
    return null
  }

  const handleGoogleSignIn = async () => {
    if (typeof window !== 'undefined' && detectInAppBrowser(window.navigator.userAgent)) {
      setShowInAppGuide(true)
      return
    }
    try {
      storeRedirectPath(searchParams.get('redirect'))
      const data = await httpClient.post('/auth/signin/google') as { authUrl?: string }
      if (data.authUrl) {
        window.location.href = data.authUrl
      }
    } catch (error) {
      console.error('Sign in error:', error)
    }
  }

  const handlePasskeyLogin = async () => {
    if (isPasskeyLoading) {
      return
    }
    if (typeof window !== 'undefined' && !window.PublicKeyCredential) {
      toast.error('このブラウザはPasskeyに対応していません')
      return
    }
    setIsPasskeyLoading(true)
    try {
      const start = await apiClient.startPasskeyLogin()
      if (!start.success) {
        toast.error('Passkeyでのログインに失敗しました')
        return
      }
      const assertion = await startAuthentication({
        optionsJSON: start.options
      })
      const finish = await apiClient.finishPasskeyLogin(start.challengeId, assertion as unknown as AuthenticatorAssertionResponseJSON)
      if (!finish.success) {
        toast.error('Passkeyでのログインに失敗しました')
        return
      }
      showSuccessToast({ message: 'Passkeyでログインしました' })
      router.push(consumeStoredRedirectPath('/'))
    } catch (error) {
      console.error('Passkey login failed:', error)
      toast.error('Passkeyでのログインに失敗しました')
    } finally {
      setIsPasskeyLoading(false)
    }
  }

  const isLoading = loading

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md overflow-hidden">
        <CardHeader className="bg-gray-800 text-white pb-4">
          <CardTitle className="text-center text-2xl font-bold">MLM DX ログイン</CardTitle>
          <div className="mx-auto mt-1 w-full">
            <div className="text-gray-300 text-sm text-center">
              大学から付与されたアカウントを使用してください
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          {errorMessage && (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {errorMessage}
            </div>
          )}
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <div className="space-y-4">
              <Button
                onClick={handleGoogleSignIn}
                size="lg"
                className="w-full bg-white hover:bg-gray-50 text-gray-900 border border-gray-300"
              >
                <div className="flex items-center justify-center w-full">
                  <div className="mr-2">
                    <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" xmlnsXlink="http://www.w3.org/1999/xlink" className="block h-5 w-5">
                      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                      <path fill="none" d="M0 0h48v48H0z"></path>
                    </svg>
                  </div>
                  <span>Googleでログイン</span>
                </div>
              </Button>
              <LoadingButton
                onClick={handlePasskeyLogin}
                className="w-full bg-white hover:bg-gray-50 text-gray-900 border border-gray-300"
                size="lg"
                isLoading={isPasskeyLoading}
              >
                Passkeyでログイン
              </LoadingButton>
            </div>
          )}
        </CardContent>
      </Card>

      {showInAppGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="relative w-full max-w-lg">
              <button
              type="button"
              onClick={() => setShowInAppGuide(false)}
              className="absolute right-0 top-0 z-10 inline-flex h-8 w-8 -translate-y-1/2 translate-x-1/2 items-center justify-center rounded-full border border-gray-300 bg-white text-gray-700 shadow hover:bg-gray-100"
              aria-label="閉じる"
            >
              ×
            </button>
            <InAppBrowserGuide />
          </div>
        </div>
      )}
    </div>
  )
}

export function LoginPage() {
  return <LoginContent />
}
