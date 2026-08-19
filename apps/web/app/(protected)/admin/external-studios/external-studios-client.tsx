'use client'

import { Suspense, useCallback, useEffect, useState, type FormEvent } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { format } from 'date-fns'
import { ja as jaLocale } from 'date-fns/locale'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LoadingButton } from '@/components/ui/loading-button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
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

const getDefaultHallPeriod = () => {
  const today = getJSTDateString(new Date())
  const drawDate = new Date() < new Date(`${today}T21:00:00+09:00`)
    ? today
    : addJSTDays(today, 1)
  const targetDate = addJSTDays(drawDate, 1)
  return { startDateTime: `${targetDate}T06:00`, endDateTime: `${targetDate}T23:00`, drawDate }
}

export function ExternalStudiosClient({ initialExternals }: { initialExternals?: External[] | null }) {
  return (
    <Suspense fallback={null}>
      <ExternalStudiosContent initialExternals={initialExternals} />
    </Suspense>
  )
}

function ExternalStudiosContent({ initialExternals }: { initialExternals?: External[] | null }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { user, loading: authLoading } = useAuth()
  const [externals, setExternals] = useState<External[]>(initialExternals ?? [])
  const [loading, setLoading] = useState(initialExternals === undefined || initialExternals === null)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [targetType, setTargetType] = useState<'HALL' | 'EXTERNAL'>('EXTERNAL')
  const [names, setNames] = useState<string[]>([''])
  const [startDateTime, setStartDateTime] = useState(() => getDefaultPeriod().startDateTime)
  const [endDateTime, setEndDateTime] = useState(() => getDefaultPeriod().endDateTime)
  const [drawDate, setDrawDate] = useState(() => getDefaultHallPeriod().drawDate)

  const fetchExternals = useCallback(async (showLoading = false) => {
    try {
      if (showLoading) setLoading(true)
      const response = await apiClient.getExternals()
      if (response.success && response.data) {
        setExternals(response.data)
      } else {
        toast.error('抽選対象の取得中にエラーが発生しました', {
          description: translateError(response.error || 'UNKNOWN_ERROR'),
        })
      }
    } catch (error) {
      toast.error('抽選対象の取得中にエラーが発生しました', {
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
    if (initialExternals !== undefined && initialExternals !== null) return
    void fetchExternals(true)
  }, [authLoading, fetchExternals, initialExternals, pathname, router, searchParams, user])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const normalizedNames = targetType === 'HALL' ? ['ホール'] : names.map((name) => name.trim())
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
    if (targetType === 'HALL' && (
      startDateTime.slice(0, 10) !== endDateTime.slice(0, 10)
      || startDateTime.slice(11) < '06:00'
      || endDateTime.slice(11) > '23:00'
      || end.getTime() - start.getTime() < 30 * 60_000
    )) {
      toast.error('ホールは同じ日の6:00〜23:00に30分以上で設定してください')
      return
    }
    const drawAt = targetType === 'HALL' ? new Date(`${drawDate}T21:00:00+09:00`) : null
    if (targetType === 'HALL' && (
      !drawDate
      || !drawAt
      || Number.isNaN(drawAt.getTime())
      || drawAt <= new Date()
      || drawAt >= start
    )) {
      toast.error('抽選実行日の21:00は、現在より後かつ利用開始日時より前にしてください')
      return
    }

    try {
      setIsCreating(true)
      const response = await apiClient.createExternals({
        target_type: targetType,
        names: normalizedNames,
        start_datetime: start.toISOString(),
        end_datetime: end.toISOString(),
        draw_date: targetType === 'HALL' ? drawDate : null,
      })
      if (response.success) {
        showSuccessToast({ message: '抽選対象を追加しました' })
        setIsFormOpen(false)
        await fetchExternals()
      } else {
        toast.error('抽選対象の追加中にエラーが発生しました', {
          description: translateError(response.error || 'UNKNOWN_ERROR'),
        })
      }
    } catch (error) {
      toast.error('抽選対象の追加中にエラーが発生しました', {
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
        showSuccessToast({ message: '抽選対象を削除しました' })
        await fetchExternals()
      } else {
        toast.error('抽選対象の削除中にエラーが発生しました', {
          description: translateError(response.error || 'UNKNOWN_ERROR'),
        })
      }
    } catch (error) {
      toast.error('抽選対象の削除中にエラーが発生しました', {
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
              <p className="py-8 text-center text-sm text-gray-600">抽選対象が登録されていません</p>
            ) : (
              <div className="space-y-2">
                {externals.map((external) => (
                  <div key={external.id} className="flex items-center justify-between gap-3 rounded-lg border p-3 hover:bg-gray-50">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">
                        <Badge variant="outline" className="mr-2">{external.target_type === 'HALL' ? 'ホール' : '外部'}</Badge>
                        {external.target_type === 'EXTERNAL'
                          ? external.room_names.map((name, index) => `${index + 1}. ${name}`).join(' / ')
                          : '抽選時間枠'}
                      </div>
                      <div className="mt-0.5 text-xs text-gray-600">
                        {format(new Date(external.start_datetime), 'M月d日 H:mm', { locale: jaLocale })} 〜 {format(new Date(external.end_datetime), 'M月d日 H:mm', { locale: jaLocale })}
                      </div>
                      {external.target_type === 'HALL' && external.draw_datetime && (
                        <div className="mt-0.5 text-xs text-gray-600">
                          抽選 {format(new Date(external.draw_datetime), 'M月d日 H:mm', { locale: jaLocale })}
                        </div>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      disabled={deletingId === external.id}
                      onClick={() => void handleDelete(external.id)}
                      aria-label={`${external.target_type === 'HALL' ? 'ホール' : external.room_names.join('、')}を削除`}
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
            <DialogTitle>抽選対象を追加</DialogTitle>
            <DialogDescription>抽選する場所と利用時間枠を登録します。</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="lottery-target-type">対象</Label>
              <Select value={targetType} onValueChange={(value: 'HALL' | 'EXTERNAL') => {
                setTargetType(value)
                if (value === 'HALL') {
                  const period = getDefaultHallPeriod()
                  setStartDateTime(period.startDateTime)
                  setEndDateTime(period.endDateTime)
                  setDrawDate(period.drawDate)
                } else {
                  const period = getDefaultPeriod()
                  setStartDateTime(period.startDateTime)
                  setEndDateTime(period.endDateTime)
                }
              }}>
                <SelectTrigger id="lottery-target-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="HALL">ホール</SelectItem>
                  <SelectItem value="EXTERNAL">外部</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {targetType === 'EXTERNAL' && <div className="space-y-2">
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
            </div>}
            {targetType === 'HALL' && (
              <div className="space-y-2">
                <Label htmlFor="hall-lottery-draw-date">抽選実行日（21:00）</Label>
                <Input
                  id="hall-lottery-draw-date"
                  type="date"
                  min={getJSTDateString(new Date())}
                  max={startDateTime.slice(0, 10) || undefined}
                  value={drawDate}
                  onChange={(event) => setDrawDate(event.target.value)}
                  required
                />
              </div>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="external-start-datetime">開始日時</Label>
                <Input id="external-start-datetime" type="datetime-local" step={60} value={startDateTime} onChange={(event) => setStartDateTime(event.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="external-end-datetime">終了日時</Label>
                <Input id="external-end-datetime" type="datetime-local" step={60} min={startDateTime} value={endDateTime} onChange={(event) => setEndDateTime(event.target.value)} required />
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
