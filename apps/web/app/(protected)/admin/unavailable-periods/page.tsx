'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LoadingButton } from '@/components/ui/loading-button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { format, addDays } from 'date-fns'
import { ja as jaLocale } from 'date-fns/locale'
import { CalendarIcon, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { apiClient } from '@/lib/api'
import { toast } from 'sonner'
import { translateError } from '@/lib/error-label'
import { useAuth } from '@/app/context/AuthContext'
import { isAdmin } from '@shared-schemas'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'

interface UnavailablePeriod {
  id: string
  start_datetime: string
  end_datetime: string
  reason: string | null
  created_at: string
  updated_at: string
}

export default function UnavailablePeriodsPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [periods, setPeriods] = useState<UnavailablePeriod[]>([])
  const [loading, setLoading] = useState(true)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [startDate, setStartDate] = useState<Date | undefined>(new Date())
  const [startTime, setStartTime] = useState('00:00')
  const [endDate, setEndDate] = useState<Date | undefined>(addDays(new Date(), 1))
  const [endTime, setEndTime] = useState('00:00')
  const [reason, setReason] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [periodToDelete, setPeriodToDelete] = useState<string | null>(null)

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      router.push('/login')
      return
    }
    if (!isAdmin(user.role)) {
      router.push('/')
      return
    }
    fetchPeriods()
  }, [authLoading, user, router])

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!startDate || !endDate) {
      toast.error('開始日と終了日を選択してください')
      return
    }

    const start = new Date(startDate)
    const [startHour, startMinute] = startTime.split(':').map(Number)
    start.setHours(startHour, startMinute, 0, 0)

    const end = new Date(endDate)
    const [endHour, endMinute] = endTime.split(':').map(Number)
    end.setHours(endHour, endMinute, 0, 0)

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
        toast.success('予約不可期間を追加しました')
        setIsFormOpen(false)
        setStartDate(new Date())
        setStartTime('00:00')
        setEndDate(addDays(new Date(), 1))
        setEndTime('00:00')
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
        toast.success('予約不可期間を削除しました')
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
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>開始日</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !startDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {startDate ? format(startDate, "yyyy年M月d日", { locale: jaLocale }) : <span>日付を選択</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={startDate}
                        onSelect={setStartDate}
                        initialFocus
                        locale={jaLocale}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-2">
                  <Label>開始時刻</Label>
                  <Input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>終了日</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !endDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {endDate ? format(endDate, "yyyy年M月d日", { locale: jaLocale }) : <span>日付を選択</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={endDate}
                        onSelect={setEndDate}
                        initialFocus
                        locale={jaLocale}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-2">
                  <Label>終了時刻</Label>
                  <Input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
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

