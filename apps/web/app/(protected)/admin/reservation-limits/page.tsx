'use client'

import { useState, useEffect } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { format, addDays } from 'date-fns'
import { ja as jaLocale } from 'date-fns/locale'
import { CalendarIcon, Pencil, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LoadingButton } from '@/components/ui/loading-button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { apiClient } from '@/lib/api'
import { cn, showSuccessToast } from '@/lib/utils'
import { translateError } from '@/lib/error-label'
import { useAuth } from '@/app/context/AuthContext'
import { getLoginPath } from '@/lib/auth-redirect'
import { isAdmin, type ReservationLimit, type ReservationLimitScope } from '@shared-schemas'
import { toast } from 'sonner'

type LimitFormState = {
  scope: ReservationLimitScope
  limitType: 'FIXED' | 'ROLLING'
  startDate: Date | undefined
  startTime: string
  endDate: Date | undefined
  endTime: string
  windowDays: string
  maxHours: string
}

const defaultFormState = (): LimitFormState => ({
  scope: 'PERSONAL',
  limitType: 'FIXED',
  startDate: new Date(),
  startTime: '00:00',
  endDate: addDays(new Date(), 7),
  endTime: '00:00',
  windowDays: '7',
  maxHours: '4',
})

const scopeLabels: Record<ReservationLimitScope, string> = {
  PERSONAL: '個人',
  GROUP: '団体',
}

const typeLabels = {
  FIXED: '期間限定',
  ROLLING: '常設',
} as const

export default function ReservationLimitsPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { user, loading: authLoading } = useAuth()
  const [limits, setLimits] = useState<ReservationLimit[]>([])
  const [loading, setLoading] = useState(true)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [editingLimit, setEditingLimit] = useState<ReservationLimit | null>(null)
  const [limitToDelete, setLimitToDelete] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [form, setForm] = useState<LimitFormState>(defaultFormState)

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
    fetchLimits()
  }, [authLoading, user, router, pathname, searchParams])

  const fetchLimits = async () => {
    try {
      setLoading(true)
      const response = await apiClient.getReservationLimits()
      if (response.success && response.data) {
        setLimits(response.data)
      }
    } catch (err) {
      toast.error('予約上限の取得中にエラーが発生しました')
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setEditingLimit(null)
    setForm(defaultFormState())
  }

  const openCreateForm = () => {
    resetForm()
    setIsFormOpen(true)
  }

  const hasRollingLimitForScope = (scope: ReservationLimitScope) => {
    return limits.some((limit) => (
      limit.limit_type === 'ROLLING' &&
      limit.scope === scope &&
      limit.id !== editingLimit?.id
    ))
  }

  const isRollingSelectionUnavailable = form.limitType === 'ROLLING' && hasRollingLimitForScope(form.scope)

  const openEditForm = (limit: ReservationLimit) => {
    const start = limit.start_datetime ? new Date(limit.start_datetime) : null
    const end = limit.end_datetime ? new Date(limit.end_datetime) : null
    setEditingLimit(limit)
    setForm({
      scope: limit.scope,
      limitType: limit.limit_type,
      startDate: start || new Date(),
      startTime: start ? format(start, 'HH:mm') : '00:00',
      endDate: end || addDays(new Date(), 7),
      endTime: end ? format(end, 'HH:mm') : '00:00',
      windowDays: limit.window_days ? String(limit.window_days) : '7',
      maxHours: String(limit.max_minutes / 60),
    })
    setIsFormOpen(true)
  }

  const buildDateTime = (date: Date, time: string) => {
    const result = new Date(date)
    const [hour, minute] = time.split(':').map(Number)
    result.setHours(hour, minute, 0, 0)
    return result
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (form.limitType === 'FIXED' && (!form.startDate || !form.endDate)) {
      toast.error('開始日と終了日を選択してください')
      return
    }

    const maxHours = Number(form.maxHours)
    if (!Number.isFinite(maxHours) || maxHours <= 0) {
      toast.error('上限時間は0より大きい数値で入力してください')
      return
    }

    const maxMinutes = Math.round(maxHours * 60)

    const windowDays = Number(form.windowDays)
    if (form.limitType === 'ROLLING' && (!Number.isInteger(windowDays) || windowDays <= 0)) {
      toast.error('対象日数は1日以上の整数で入力してください')
      return
    }

    if (isRollingSelectionUnavailable) {
      toast.error(`${scopeLabels[form.scope]}の常設予約上限は既に設定されています`)
      return
    }

    let start: Date | null = null
    let end: Date | null = null
    if (form.limitType === 'FIXED') {
      start = buildDateTime(form.startDate as Date, form.startTime)
      end = buildDateTime(form.endDate as Date, form.endTime)
      if (end <= start) {
        toast.error('終了日時は開始日時より後である必要があります')
        return
      }
    }

    const requestData = {
      scope: form.scope,
      limit_type: form.limitType,
      start_datetime: start ? start.toISOString() : undefined,
      end_datetime: end ? end.toISOString() : undefined,
      window_days: form.limitType === 'ROLLING' ? windowDays : undefined,
      max_minutes: maxMinutes,
    }

    try {
      setIsSubmitting(true)
      const response = editingLimit
        ? await apiClient.updateReservationLimit(editingLimit.id, requestData)
        : await apiClient.createReservationLimit(requestData)

      if (response.success) {
        showSuccessToast({ message: editingLimit ? '予約上限を更新しました' : '予約上限を追加しました' })
        setIsFormOpen(false)
        resetForm()
        await fetchLimits()
      } else {
        toast.error('予約上限の保存中にエラーが発生しました', {
          description: translateError(response.error || 'UNKNOWN_ERROR')
        })
      }
    } catch (err) {
      toast.error('予約上限の保存中にエラーが発生しました', {
        description: translateError((err as Error).message)
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteClick = (id: string) => {
    setLimitToDelete(id)
    setIsDeleteDialogOpen(true)
  }

  const confirmDelete = async () => {
    if (!limitToDelete) return

    try {
      setDeletingId(limitToDelete)
      const response = await apiClient.deleteReservationLimit(limitToDelete)

      if (response.success) {
        showSuccessToast({ message: '予約上限を削除しました' })
        setIsDeleteDialogOpen(false)
        setLimitToDelete(null)
        await fetchLimits()
      } else {
        toast.error('予約上限の削除中にエラーが発生しました', {
          description: translateError(response.error || 'UNKNOWN_ERROR')
        })
      }
    } catch (err) {
      toast.error('予約上限の削除中にエラーが発生しました', {
        description: translateError((err as Error).message)
      })
    } finally {
      setDeletingId(null)
    }
  }

  if (authLoading || loading) {
    return (
      <>
        <PageHeader rightActions={<Button disabled>追加</Button>} />
        <div className="p-4 pt-0 mx-auto space-y-4">
          <Card>
            <CardContent className="p-4">
              <Skeleton className="h-12 w-full" />
            </CardContent>
          </Card>
        </div>
      </>
    )
  }

  return (
    <>
      <PageHeader rightActions={<Button onClick={openCreateForm}>追加</Button>} />
      <div className="p-4 pt-0 mx-auto space-y-4">
        <Card>
          <CardContent className="p-4">
            {limits.length === 0 ? (
              <p className="text-sm text-gray-600 py-8 text-center">予約上限が登録されていません</p>
            ) : (
              <div className="space-y-2">
                {limits.map((limit) => (
                  <div
                    key={limit.id}
                    className="flex items-center justify-between gap-3 p-3 border rounded-lg hover:bg-gray-50"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        <span>{scopeLabels[limit.scope]}</span>
                        <span>{typeLabels[limit.limit_type]}</span>
                        <span>{Math.floor(limit.max_minutes / 60)}時間{limit.max_minutes % 60 > 0 ? `${limit.max_minutes % 60}分` : ''}</span>
                      </div>
                      <div className="text-xs text-gray-600 mt-0.5">
                        {limit.limit_type === 'FIXED' && limit.start_datetime && limit.end_datetime
                          ? `${format(new Date(limit.start_datetime), 'M月d日 H:mm', { locale: jaLocale })} 〜 ${format(new Date(limit.end_datetime), 'M月d日 H:mm', { locale: jaLocale })}`
                          : `${limit.window_days}日間で${Math.floor(limit.max_minutes / 60)}時間`
                        }
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button variant="outline" size="sm" onClick={() => openEditForm(limit)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDeleteClick(limit.id)}
                        disabled={deletingId === limit.id}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={isFormOpen} onOpenChange={(open) => {
          setIsFormOpen(open)
          if (!open) resetForm()
        }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingLimit ? '予約上限を編集' : '予約上限を追加'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>対象</Label>
                <Select
                  value={form.scope}
                  onValueChange={(value) => setForm((prev) => {
                    const nextScope = value as ReservationLimitScope
                    return {
                      ...prev,
                      scope: nextScope,
                      limitType: prev.limitType === 'ROLLING' && hasRollingLimitForScope(nextScope) ? 'FIXED' : prev.limitType,
                    }
                  })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PERSONAL">個人</SelectItem>
                    <SelectItem value="GROUP">団体</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>種別</Label>
                <Select
                  value={form.limitType}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, limitType: value as 'FIXED' | 'ROLLING' }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FIXED">期間限定</SelectItem>
                    <SelectItem value="ROLLING" disabled={hasRollingLimitForScope(form.scope)}>常設</SelectItem>
                  </SelectContent>
                </Select>
                {hasRollingLimitForScope(form.scope) && form.limitType !== 'ROLLING' && (
                  <p className="mt-1 text-xs text-gray-600">
                    {scopeLabels[form.scope]}の常設予約上限は既に設定されています。
                  </p>
                )}
              </div>

              {form.limitType === 'FIXED' ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>開始日</Label>
                    <Popover modal={true}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !form.startDate && "text-muted-foreground")}>
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {form.startDate ? format(form.startDate, 'PPP', { locale: jaLocale }) : '日付を選択'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={form.startDate}
                          onSelect={(date) => setForm((prev) => ({ ...prev, startDate: date }))}
                          initialFocus
                          locale={jaLocale}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div>
                    <Label>開始時刻</Label>
                    <Input
                      type="time"
                      value={form.startTime}
                      onChange={(event) => setForm((prev) => ({ ...prev, startTime: event.target.value }))}
                    />
                  </div>
                  <div>
                    <Label>終了日</Label>
                    <Popover modal={true}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !form.endDate && "text-muted-foreground")}>
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {form.endDate ? format(form.endDate, 'PPP', { locale: jaLocale }) : '日付を選択'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={form.endDate}
                          onSelect={(date) => setForm((prev) => ({ ...prev, endDate: date }))}
                          initialFocus
                          locale={jaLocale}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div>
                    <Label>終了時刻</Label>
                    <Input
                      type="time"
                      value={form.endTime}
                      onChange={(event) => setForm((prev) => ({ ...prev, endTime: event.target.value }))}
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <Label>対象日数</Label>
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    value={form.windowDays}
                    onChange={(event) => setForm((prev) => ({ ...prev, windowDays: event.target.value }))}
                  />
                </div>
              )}

              <div>
                <Label>上限時間（時間）</Label>
                <Input
                  type="number"
                  min={1}
                  step={1}
                  value={form.maxHours}
                  onChange={(event) => setForm((prev) => ({ ...prev, maxHours: event.target.value }))}
                />
              </div>

              <LoadingButton type="submit" isLoading={isSubmitting} className="w-full">
                保存
              </LoadingButton>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>予約上限を削除しますか？</DialogTitle>
              <DialogDescription>
                この操作は取り消せません。
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>キャンセル</Button>
              <LoadingButton variant="destructive" onClick={confirmDelete} isLoading={Boolean(deletingId)}>
                削除
              </LoadingButton>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </>
  )
}
