'use client'

import { useState, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { LoadingButton } from '@/components/ui/loading-button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { motion } from 'framer-motion'
import { UserData, instrumentNames, roleNames, Role, Instrument } from '@/app/types'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/app/context/AuthContext'
import { SetupWizard } from './setup-wizard'
import { PageHeader } from '@/components/page-header'
import { apiClient, type PasskeyCredential } from '@/lib/api'
import { Skeleton } from '@/components/ui/skeleton'
import { startRegistration } from '@simplewebauthn/browser'
import type { AuthenticatorAttestationResponseJSON } from '@simplewebauthn/types'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { httpClient } from '@/lib/http-client'

export default function Page() {
  const [isEditing, setIsEditing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [userData, setUserData] = useState<UserData | null>(null)
  const [isPasskeyProcessing, setIsPasskeyProcessing] = useState(false)
  const [isPasskeyLoading, setIsPasskeyLoading] = useState(false)
  const [passkeys, setPasskeys] = useState<PasskeyCredential[]>([])
  const [isPasskeyListLoading, setIsPasskeyListLoading] = useState(false)
  const [deletingPasskeyId, setDeletingPasskeyId] = useState<string | null>(null)
  const [confirmingPasskeyId, setConfirmingPasskeyId] = useState<string | null>(null)
  const [isRefreshingAvatar, setIsRefreshingAvatar] = useState(false)
  const [confirmingAvatarRefresh, setConfirmingAvatarRefresh] = useState(false)
  const router = useRouter()
  const { signOut, user, loading: authLoading } = useAuth()

  const fetchPasskeys = useCallback(async () => {
    setIsPasskeyListLoading(true)
    try {
      const res = await apiClient.getPasskeyCredentials()
      if (res.success && Array.isArray(res.passkeys)) {
        setPasskeys(res.passkeys)
      } else {
        setPasskeys([])
      }
    } catch (error) {
      console.error('Failed to fetch passkeys:', error)
      toast.error('Passkeyの取得に失敗しました')
    } finally {
      setIsPasskeyListLoading(false)
    }
  }, [])

  useEffect(() => {
    const init = async () => {
      if (authLoading) return
      if (!user) {
        router.push('/login')
        return
      }
      try {
        setIsPasskeyLoading(true)
        const res = await apiClient.getCurrentUserData()
        if (res.success && res.data) {
          const ud: UserData = {
            grade: res.data.grade,
            name: res.data.name ?? '',
            role: res.data.role as Role,
            email: res.data.email,
            nickname: res.data.nickname,
            instruments: res.data.instruments as Instrument[],
            student_number: (res.data as { student_number?: string })?.student_number
          }
          setUserData(ud)
          const needsSetup = !ud.nickname || (ud.instruments && ud.instruments.length === 0)
          if (needsSetup) {
            setIsEditing(true)
          }
        }
        await fetchPasskeys()
      } finally {
        setLoading(false)
        setIsPasskeyLoading(false)
      }
    }
    init()
  }, [authLoading, user, router, fetchPasskeys])

  const handleResetProfile = useCallback(() => {
    setIsEditing(true)
  }, [])

  const handleEditComplete = useCallback((updatedData: UserData) => {
    setIsEditing(false)
    setUserData(updatedData)
  }, [])

  const handlePasskeySetup = useCallback(async () => {
    if (isPasskeyProcessing) {
      return
    }
    if (typeof window !== 'undefined' && !window.PublicKeyCredential) {
      toast.error('このブラウザはPasskeyに対応していません')
      return
    }
    setIsPasskeyProcessing(true)
    try {
      const start = await apiClient.startPasskeyRegistration()
      const attestation = await startRegistration({
        optionsJSON: start.options
      })
      await apiClient.finishPasskeyRegistration(start.challengeId, attestation as unknown as AuthenticatorAttestationResponseJSON)
      toast.success('Passkeyを追加しました')
      await fetchPasskeys()
    } catch (error) {
      if (error instanceof Error) {
        toast.error(error.message)
      } else {
        toast.error('Passkeyの追加に失敗しました')
      }
    } finally {
      setIsPasskeyProcessing(false)
    }
  }, [isPasskeyProcessing, fetchPasskeys])

  const handlePasskeyDeleteClick = useCallback((id: string) => {
    setConfirmingPasskeyId(id)
  }, [])

  const handleCancelDelete = useCallback(() => {
    if (deletingPasskeyId) {
      return
    }
    setConfirmingPasskeyId(null)
  }, [deletingPasskeyId])

  const handleConfirmDelete = useCallback(async () => {
    if (!confirmingPasskeyId) {
      return
    }
    setDeletingPasskeyId(confirmingPasskeyId)
    try {
      const res = await apiClient.deletePasskeyCredential(confirmingPasskeyId)
      if (res.success) {
        toast.success('Passkeyを削除しました')
        await fetchPasskeys()
      } else {
        toast.error('Passkeyの削除に失敗しました')
      }
    } catch (error) {
      console.error('Failed to delete passkey:', error)
      toast.error('Passkeyの削除に失敗しました')
    } finally {
      setDeletingPasskeyId(null)
      setConfirmingPasskeyId(null)
    }
  }, [confirmingPasskeyId, fetchPasskeys])

  const formatDateTime = useCallback((value: string) => {
    try {
      return new Date(value).toLocaleString('ja-JP', { hour12: false })
    } catch {
      return value
    }
  }, [])

  const summarizeCredentialId = useCallback((value: string) => {
    if (value.length <= 16) {
      return value
    }
    return `${value.slice(0, 8)}…${value.slice(-4)}`
  }, [])

  const formatDeviceType = useCallback((value: string | null) => {
    if (value === 'singleDevice') {
      return '本人端末のみ'
    }
    if (value === 'multiDevice') {
      return 'マルチデバイス'
    }
    return '不明'
  }, [])

  const formatBackedUp = useCallback((value: boolean) => {
    return value ? 'バックアップ済み' : '未バックアップ'
  }, [])

  const formatTransports = useCallback((value: string[]) => {
    if (!value || value.length === 0) {
      return '不明'
    }
    return value.join(', ')
  }, [])

  const confirmingPasskey = confirmingPasskeyId
    ? passkeys.find((item) => item.id === confirmingPasskeyId) ?? null
    : null

  const handleConfirmDialogOpenChange = useCallback((open: boolean) => {
    if (!open && !deletingPasskeyId) {
      setConfirmingPasskeyId(null)
    }
  }, [deletingPasskeyId])

  const handleRefreshAvatarClick = useCallback(() => {
    setConfirmingAvatarRefresh(true)
  }, [])

  const handleCancelAvatarRefresh = useCallback(() => {
    if (isRefreshingAvatar) {
      return
    }
    setConfirmingAvatarRefresh(false)
  }, [isRefreshingAvatar])

  const handleConfirmRefreshAvatar = useCallback(async () => {
    if (isRefreshingAvatar) {
      return
    }
    setIsRefreshingAvatar(true)
    try {
      const res = await apiClient.resetAvatar()
      if (res.success) {
        await signOut()
        const data = await httpClient.post('/auth/signin/google') as { authUrl?: string }
        if (data.authUrl) {
          window.location.href = data.authUrl
        }
      } else {
        toast.error('プロフィール画像のリセットに失敗しました')
        setConfirmingAvatarRefresh(false)
      }
    } catch (error) {
      console.error('Failed to refresh avatar:', error)
      toast.error('プロフィール画像のリセットに失敗しました')
      setConfirmingAvatarRefresh(false)
    } finally {
      setIsRefreshingAvatar(false)
    }
  }, [isRefreshingAvatar, signOut])

  const handleAvatarRefreshDialogOpenChange = useCallback((open: boolean) => {
    if (!open && !isRefreshingAvatar) {
      setConfirmingAvatarRefresh(false)
    }
  }, [isRefreshingAvatar])

  if (!userData && !loading) {
    return null
  }

  if (isEditing && userData) {
    return <SetupWizard initialUserData={userData} onComplete={handleEditComplete} />
  }

  return (
    <>
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
                  <div className="bg-gray-50 p-2 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium text-gray-500">プロフィール画像</p>
                        <p className="text-sm font-semibold">Googleアカウントから取得</p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleRefreshAvatarClick}
                        disabled={isRefreshingAvatar}
                      >
                        更新
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="min-w-fit max-w-2xl mx-auto">
              <CardHeader>
                <CardTitle>Passkey</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {isPasskeyListLoading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-6 w-40" />
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                  </div>
                ) : passkeys.length === 0 ? (
                  <p className="text-sm text-gray-500">登録済みのPasskeyはありません</p>
                ) : (
                  <div className="space-y-3">
                    {passkeys.map((item) => (
                      <div key={item.id} className="flex flex-col gap-3 rounded-lg border border-gray-200 p-3 md:flex-row md:items-center md:justify-between">
                        <div className="space-y-1">
                          <div className="text-sm font-semibold text-gray-900">
                            {summarizeCredentialId(item.credential_id)}
                          </div>
                          <div className="text-xs text-gray-600">
                            登録日時: {formatDateTime(item.created_at)}
                          </div>
                          <div className="text-xs text-gray-600">
                            デバイス種別: {formatDeviceType(item.device_type)} / {formatBackedUp(item.backed_up)}
                          </div>
                          <div className="text-xs text-gray-600">
                            トランスポート: {formatTransports(item.transports)}
                          </div>
                        </div>
                        <LoadingButton
                          variant="destructive"
                          size="sm"
                          onClick={() => handlePasskeyDeleteClick(item.id)}
                          isLoading={deletingPasskeyId === item.id}
                        >
                          削除
                        </LoadingButton>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-6 border-t border-gray-200">
                  <Button
                    onClick={handlePasskeySetup}
                    className="w-full"
                    disabled={isPasskeyProcessing || isPasskeyLoading}
                  >
                    Passkeyを追加
                  </Button>
                </div>
              </CardContent>
            </Card>
            </motion.div>
          </div>
        </>
      )}
    </div>
    <Dialog open={!!confirmingPasskeyId} onOpenChange={handleConfirmDialogOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Passkeyを削除</DialogTitle>
          <DialogDescription>
            {confirmingPasskey
              ? `${summarizeCredentialId(confirmingPasskey.credential_id)} を削除しますか？`
              : 'このPasskeyを削除しますか？'}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleCancelDelete}
            disabled={!!deletingPasskeyId}
          >
            キャンセル
          </Button>
          <LoadingButton
            variant="destructive"
            onClick={handleConfirmDelete}
            isLoading={!!deletingPasskeyId}
          >
            削除
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog open={confirmingAvatarRefresh} onOpenChange={handleAvatarRefreshDialogOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>プロフィール画像を更新</DialogTitle>
          <DialogDescription>
            プロフィール画像を最新のGoogleアカウントの画像に更新します。
            <br />
            Googleで再ログインしていただく必要があります。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleCancelAvatarRefresh}
            disabled={isRefreshingAvatar}
          >
            キャンセル
          </Button>
          <LoadingButton
            onClick={handleConfirmRefreshAvatar}
            isLoading={isRefreshingAvatar}
          >
            更新
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  )
}