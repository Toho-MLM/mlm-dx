'use client'

import { Suspense, useCallback, useEffect, useState, type FormEvent } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { format } from 'date-fns'
import { ja as jaLocale } from 'date-fns/locale'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LoadingButton } from '@/components/ui/loading-button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/app/context/AuthContext'
import { apiClient } from '@/lib/api'
import { getLoginPath } from '@/lib/auth-redirect'
import { translateError } from '@/lib/error-label'
import { showSuccessToast } from '@/lib/utils'
import { isAdmin, type External } from '@shared-schemas'

const getJSTDateString = (value: Date) => new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(value)

const addJSTDays = (dateString: string, days: number) => {
  const date = new Date(`${dateString}T00:00:00+09:00`)
  date.setUTCDate(date.getUTCDate() + days)
  return getJSTDateString(date)
}

const getDefaultPeriod = () => {
  const today = getJSTDateString(new Date())
  return {
    startDateTime: `${addJSTDays(today, 1)}T00:00`,
    endDateTime: `${addJSTDays(today, 2)}T00:00`,
  }
}

export default function ExternalStudiosPage() {
  return (
    <Suspense fallback={null}>
      <ExternalStudiosContent />
    </Suspense>
  )
}

function ExternalStudiosContent() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { user, loading: authLoading } = useAuth()
  const [externals, setExternals] = useState<External[]>([])
  const [loading, setLoading] = useState(true)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [names, setNames] = useState<string[]>([''])
  const [startDateTime, setStartDateTime] = useState(() => getDefaultPeriod().startDateTime)
  const [endDateTime, setEndDateTime] = useState(() => getDefaultPeriod().endDateTime)

  const fetchExternals = useCallback(async (showLoading = false) => {
    try {
      if (showLoading) setLoading(true)
      const response = await apiClient.getExternals()
      if (response.success && response.data) {
        setExternals(response.data)
      } else {
        toast.error('外部スタジオの取得中にエラーが発生しました', {
          description: translateError(response.error || 'UNKNOWN_ERROR'),
        })
      }
    } catch (error) {
      toast.error('外部スタジオの取得中にエラーが発生しました', {
        description: translateError((error as Error).message),
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      router.push(getLoginPath(pathname, searchParams))
      return
    }
    if (!isAdmin(user.role)) {
      router.push('/')
      return
    }
    void fetchExternals(true)
  }, [authLoading, fetchExternals, pathname, router, searchParams, user])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const normalizedNames = names.map((name) => name.trim())
    if (normalizedNames.some((name) => !name)) {
      toast.error('すべての部屋名を入力してください')
      return
    }
    if (new Set(normalizedNames).size !== normalizedNames.length) {
      toast.error('部屋名は重複できません')
      return
    }

    const start = new Date(`${startDateTime}:00+09:00`)
    const end = new Date(`${endDateTime}:00+09:00`)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      toast.error('終了日時は開始日時より後にしてください')
      return
    }

    try {
      setIsCreating(true)
      const response = await apiClient.createExternals({
        names: normalizedNames,
        start_datetime: start.toISOString(),
        end_datetime: end.toISOString(),
      })
      if (response.success) {
        showSuccessToast({ message: '外部スタジオを追加しました' })
        await fetchExternals()
      } else {
        toast.error('外部スタジオの追加中にエラーが発生しました', {
          description: translateError(response.error || 'UNKNOWN_ERROR'),
        })
      }
    } catch (error) {
      toast.error('外部スタジオの追加中にエラーが発生しました', {
        description: translateError((error as Error).message),
      })
    } finally {
      setIsCreating(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      setDeletingId(id)
      const response = await apiClient.deleteExternal(id)
      if (response.success) {
        showSuccessToast({ message: '外部スタジオを削除しました' })
        await fetchExternals()
      } else {
        toast.error('外部スタジオの削除中にエラーが発生しました', {
          description: translateError(response.error || 'UNKNOWN_ERROR'),
        })
      }
    } catch (error) {
      toast.error('外部スタジオの削除中にエラーが発生しました', {
        description: translateError((error as Error).message),
      })
    } finally {
      setDeletingId(null)
    }
  }

  if (authLoading || loading) {
    return (
      <>
        <PageHeader rightActions={<Button disabled>追加</Button>} />
        <div className="p-4 pt-0">
          <Skeleton className="h-24 w-full" />
        </div>
      </>
    )
  }

  return (
    <>
      <PageHeader rightActions={<Button onClick={() => setIsFormOpen(true)}>追加</Button>} />
      <div className="mx-auto space-y-4 p-4 pt-0">
        <Card>
          <CardContent className="p-4">
            {externals.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-600">外部スタジオが登録されていません</p>
            ) : (
              <div className="space-y-2">
                {externals.map((external) => (
                  <div key={external.id} className="flex items-center justify-between gap-3 rounded-lg border p-3 hover:bg-gray-50">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">
                        {external.room_names.map((name, index) => `${index + 1}. ${name}`).join(' / ')}
                      </div>
                      <div className="mt-0.5 text-xs text-gray-600">
                        {format(new Date(external.start_datetime), 'M月d日 H:mm', { locale: jaLocale })} 〜 {format(new Date(external.end_datetime), 'M月d日 H:mm', { locale: jaLocale })}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      disabled={deletingId === external.id}
                      onClick={() => void handleDelete(external.id)}
                      aria-label={`${external.room_names.join('、')}を削除`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>外部スタジオを追加</DialogTitle>
            <DialogDescription>利用時間枠と、その時間に利用できる部屋をまとめて作成します。</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>部屋名</Label>
              <div className="space-y-2">
                {names.map((name, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      value={name}
                      onChange={(event) => {
                        const nextNames = [...names]
                        nextNames[index] = event.target.value
                        setNames(nextNames)
                      }}
                      placeholder={`部屋 ${index + 1}`}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      disabled={names.length === 1}
                      onClick={() => setNames(names.filter((_, itemIndex) => itemIndex !== index))}
                      aria-label={`部屋 ${index + 1} を削除`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => setNames([...names, ''])}>
                <Plus className="h-4 w-4" />
                追加
              </Button>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="external-start-datetime">開始日時</Label>
                <Input id="external-start-datetime" type="datetime-local" step={300} value={startDateTime} onChange={(event) => setStartDateTime(event.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="external-end-datetime">終了日時</Label>
                <Input id="external-end-datetime" type="datetime-local" step={300} min={startDateTime} value={endDateTime} onChange={(event) => setEndDateTime(event.target.value)} required />
              </div>
            </div>
            <div className="flex justify-end">
              <LoadingButton type="submit" isLoading={isCreating}>作成</LoadingButton>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
