'use client'

import { Suspense, useState, useEffect, type FormEvent } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LoadingButton } from '@/components/ui/loading-button'
import { format } from 'date-fns'
import { ja as jaLocale } from 'date-fns/locale'
import { Trash2 } from 'lucide-react'
import { apiClient } from '@/lib/api'
import { toast } from 'sonner'
import { showSuccessToast } from '@/lib/utils'
import { translateError } from '@/lib/error-label'
import { useAuth } from '@/app/context/AuthContext'
import { getLoginPath } from '@/lib/auth-redirect'
import { isAdmin } from '@shared-schemas'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'

interface UnavailablePeriod {
  id: string
  start_datetime: string
  end_datetime: string
  reason: string | null
}

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
    startDateTime: `${today}T00:00`,
    endDateTime: `${addJSTDays(today, 1)}T00:00`,
  }
}

export function UnavailablePeriodsClient({ initialPeriods }: { initialPeriods?: UnavailablePeriod[] | null }) {
  return (
    <Suspense fallback={null}>
      <UnavailablePeriodsContent initialPeriods={initialPeriods} />
    </Suspense>
  )
}

function UnavailablePeriodsContent({ initialPeriods }: { initialPeriods?: UnavailablePeriod[] | null }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { user, loading: authLoading } = useAuth()
  const [periods, setPeriods] = useState<UnavailablePeriod[]>(initialPeriods ?? [])
  const [loading, setLoading] = useState(initialPeriods === undefined || initialPeriods === null)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [startDateTime, setStartDateTime] = useState(() => getDefaultPeriod().startDateTime)
  const [endDateTime, setEndDateTime] = useState(() => getDefaultPeriod().endDateTime)
  const [reason, setReason] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [periodToDelete, setPeriodToDelete] = useState<string | null>(null)

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
    if (initialPeriods !== undefined && initialPeriods !== null) return
    fetchPeriods()
  }, [authLoading, user, router, pathname, searchParams, initialPeriods])

  const fetchPeriods = async () => {
    try {
      setLoading(true)
      const response = await apiClient.getUnavailablePeriods()
      if (response.success && response.data) {
        setPeriods(response.data as UnavailablePeriod[])
      }
    } catch (err) {
      toast.error('予約不可期間の取得中にエラーが発生しました')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!startDateTime || !endDateTime) {
      toast.error('開始日時と終了日時を選択してください')
      return
    }

    const start = new Date(`${startDateTime}:00+09:00`)
    const end = new Date(`${endDateTime}:00+09:00`)

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      toast.error('日時を正しく入力してください')
      return
    }

    if (end <= start) {
      toast.error('終了日時は開始日時より後である必要があります')
      return
    }

    try {
      setIsSubmitting(true)
      const response = await apiClient.createUnavailablePeriod({
        start_datetime: start.toISOString(),
        end_datetime: end.toISOString(),
        reason: reason || undefined
      })

      if (response.success) {
        showSuccessToast({ message: '予約不可期間を追加しました' })
        setIsFormOpen(false)
        const defaultPeriod = getDefaultPeriod()
        setStartDateTime(defaultPeriod.startDateTime)
        setEndDateTime(defaultPeriod.endDateTime)
        setReason('')
        await fetchPeriods()
      } else {
        toast.error('予約不可期間の追加中にエラーが発生しました', {
          description: translateError(response.error || 'UNKNOWN_ERROR')
        })
      }
    } catch (err) {
      toast.error('予約不可期間の追加中にエラーが発生しました', {
        description: translateError((err as Error).message)
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteClick = (id: string) => {
    setPeriodToDelete(id)
    setIsDeleteDialogOpen(true)
  }

  const confirmDelete = async () => {
    if (!periodToDelete) return

    try {
      setDeletingId(periodToDelete)
      const response = await apiClient.deleteUnavailablePeriod(periodToDelete)

      if (response.success) {
        showSuccessToast({ message: '予約不可期間を削除しました' })
        setIsDeleteDialogOpen(false)
        setPeriodToDelete(null)
        await fetchPeriods()
      } else {
        toast.error('予約不可期間の削除中にエラーが発生しました', {
          description: translateError(response.error || 'UNKNOWN_ERROR')
        })
      }
    } catch (err) {
      toast.error('予約不可期間の削除中にエラーが発生しました', {
        description: translateError((err as Error).message)
      })
    } finally {
      setDeletingId(null)
    }
  }

  if (authLoading || loading) {
    return (
      <>
        <PageHeader rightActions={
          <Button disabled>追加</Button>
        } />
        <div className="p-4 pt-0 mx-auto space-y-4">
          <Card>
            <CardContent className="p-4">
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
              </div>
            </CardContent>
          </Card>
        </div>
      </>
    )
  }

  return (
    <>
      <PageHeader rightActions={
        <Button onClick={() => setIsFormOpen(true)}>追加</Button>
      } />
      <div className="p-4 pt-0 mx-auto space-y-4">
        <Card>
          <CardContent className="p-4">
            {periods.length === 0 ? (
              <p className="text-sm text-gray-600 py-8 text-center">予約不可期間が登録されていません</p>
            ) : (
              <div className="space-y-2">
                {periods.map((period) => (
                  <div
                    key={period.id}
                    className="flex items-center justify-between gap-3 p-3 border rounded-lg hover:bg-gray-50"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">
                        {format(new Date(period.start_datetime), 'M月d日 H:mm', { locale: jaLocale })} 〜 {format(new Date(period.end_datetime), 'M月d日 H:mm', { locale: jaLocale })}
                      </div>
                      {period.reason && (
                        <div className="text-xs text-gray-600 mt-0.5 truncate">{period.reason}</div>
                      )}
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="flex-shrink-0"
                      onClick={() => handleDeleteClick(period.id)}
                      disabled={deletingId === period.id}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>予約不可期間の追加</DialogTitle>
              <DialogDescription>
                予約ができない期間を設定します
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="unavailable-start-datetime">開始日時</Label>
                  <Input
                    id="unavailable-start-datetime"
                    type="datetime-local"
                    step={60}
                    value={startDateTime}
                    onChange={(event) => setStartDateTime(event.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="unavailable-end-datetime">終了日時</Label>
                  <Input
                    id="unavailable-end-datetime"
                    type="datetime-local"
                    step={60}
                    min={startDateTime}
                    value={endDateTime}
                    onChange={(event) => setEndDateTime(event.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>理由（任意）</Label>
                <Input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>
                  キャンセル
                </Button>
                <LoadingButton type="submit" isLoading={isSubmitting}>
                  追加
                </LoadingButton>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={isDeleteDialogOpen} onOpenChange={(open) => {
          setIsDeleteDialogOpen(open)
          if (!open) {
            setPeriodToDelete(null)
          }
        }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>予約不可期間の削除</DialogTitle>
              <DialogDescription>
                この操作は取り消せません。
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDeleteDialogOpen(false)}
              >
                キャンセル
              </Button>
              <LoadingButton
                variant="destructive"
                onClick={confirmDelete}
                isLoading={deletingId === periodToDelete}
              >
                削除
              </LoadingButton>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </>
  )
}
