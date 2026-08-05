'use client'

import { Suspense, useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import { CalendarPlus, Loader2 } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { useAuth } from '@/app/context/AuthContext'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LoadingButton } from '@/components/ui/loading-button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { apiClient } from '@/lib/api'
import { getLoginPath } from '@/lib/auth-redirect'
import { translateError } from '@/lib/error-label'
import { showSuccessToast } from '@/lib/utils'
import type { External, ExternalLotteryApplication, ExternalReservation } from '@shared-schemas'

type GroupOption = { id: string; name: string; is_main: boolean }

const stateLabel = { PENDING: '抽選前', WON: '当選', LOST: '落選', CANCELLED: '取消' } as const
const durationOptions = Array.from({ length: 47 }, (_, index) => 10 + index * 5)
const getJSTDateString = (value: Date | string) => {
  const date = typeof value === 'string' ? new Date(value) : value
  return new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}
const addJSTDays = (dateString: string, days: number) => {
  const date = new Date(`${dateString}T00:00:00+09:00`)
  date.setUTCDate(date.getUTCDate() + days)
  return getJSTDateString(date)
}
const getLotteryDrawAt = (studioDate: string) => {
  const drawAt = new Date(`${studioDate}T21:00:00+09:00`)
  drawAt.setUTCDate(drawAt.getUTCDate() - 1)
  return drawAt
}

const getLotteryDrawTimes = (studio: External) => {
  const drawTimes: Date[] = []
  let studioDate = getJSTDateString(studio.start_datetime)
  const lastStudioDate = getJSTDateString(new Date(new Date(studio.end_datetime).getTime() - 1))
  while (studioDate <= lastStudioDate) {
    drawTimes.push(getLotteryDrawAt(studioDate))
    studioDate = addJSTDays(studioDate, 1)
  }
  return drawTimes
}

type LotteryRange = { start: Date; end: Date; requestedMinutes: number }

const getApplicationPriority = (application: ExternalLotteryApplication) => (
  application.group_id ? (application.is_main ? 0 : 1) : 2
)

const getApplicationRange = (application: ExternalLotteryApplication, studio: External): LotteryRange | null => {
  const studioStart = new Date(studio.start_datetime)
  const studioEnd = new Date(studio.end_datetime)
  const start = application.preferred_start_datetime
    ? new Date(application.preferred_start_datetime)
    : studioStart
  const end = application.preferred_end_datetime
    ? new Date(application.preferred_end_datetime)
    : studioEnd
  if (end <= start) return null
  return {
    start,
    end,
    requestedMinutes: application.requested_duration_minutes
      ?? Math.round((end.getTime() - start.getTime()) / 60_000),
  }
}

const getOverlapMinutes = (left: LotteryRange, right: { start: Date; end: Date }) => (
  Math.max(0, Math.min(left.end.getTime(), right.end.getTime()) - Math.max(left.start.getTime(), right.start.getTime())) / 60_000
)

const estimateWinningProbability = (
  application: ExternalLotteryApplication,
  studio: External,
  studioApplications: ExternalLotteryApplication[],
  reservations: ExternalReservation[]
) => {
  const range = getApplicationRange(application, studio)
  if (!range || range.requestedMinutes <= 0) return 0

  const rangeMinutes = (range.end.getTime() - range.start.getTime()) / 60_000
  const occupiedMinutes = reservations
    .filter((reservation) => reservation.external_studio_id === studio.id && reservation.state === 'CONFIRMED')
    .reduce((total, reservation) => total + getOverlapMinutes(range, {
      start: new Date(reservation.start_time),
      end: new Date(reservation.end_time),
    }), 0)
  const capacityMinutes = Math.max(0, studio.room_names.length * rangeMinutes - occupiedMinutes)
  const priority = getApplicationPriority(application)
  let higherPriorityDemand = 0
  let samePriorityDemand = range.requestedMinutes

  studioApplications.forEach((competitor) => {
    if (competitor.id === application.id || competitor.state !== 'PENDING') return
    const competitorRange = getApplicationRange(competitor, studio)
    if (!competitorRange) return
    const overlapMinutes = getOverlapMinutes(range, competitorRange)
    if (overlapMinutes <= 0) return
    const competitorRangeMinutes = (competitorRange.end.getTime() - competitorRange.start.getTime()) / 60_000
    const effectiveDemand = competitorRange.requestedMinutes * Math.min(1, overlapMinutes / competitorRangeMinutes)
    const competitorPriority = getApplicationPriority(competitor)
    if (competitorPriority < priority) higherPriorityDemand += effectiveDemand
    if (competitorPriority === priority) samePriorityDemand += effectiveDemand
  })

  const probability = Math.max(0, capacityMinutes - higherPriorityDemand) / samePriorityDemand
  return Math.round(Math.min(1, probability) * 100)
}

export default function ExternalLotteryPage() {
  return <Suspense fallback={<div className="p-5"><Skeleton className="h-[520px] w-full" /></div>}><ExternalLotteryContent /></Suspense>
}

function ExternalLotteryContent() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { user, loading: authLoading } = useAuth()
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [open, setOpen] = useState(false)
  const [studios, setStudios] = useState<External[]>([])
  const [applications, setApplications] = useState<ExternalLotteryApplication[]>([])
  const [reservations, setReservations] = useState<ExternalReservation[]>([])
  const [groups, setGroups] = useState<GroupOption[]>([])
  const [identity, setIdentity] = useState('__personal__')
  const [studioId, setStudioId] = useState('')
  const [preferredStart, setPreferredStart] = useState('')
  const [preferredEnd, setPreferredEnd] = useState('')
  const [duration, setDuration] = useState('')

  const fetchData = useCallback(async () => {
    const [studioResponse, applicationResponse, groupResponse, reservationResponse] = await Promise.all([
      apiClient.getExternals(),
      apiClient.getExternalLotteryApplications(),
      apiClient.getGroupOptions(false),
      apiClient.getExternalReservations(),
    ])
    if (studioResponse.success && studioResponse.data) setStudios(studioResponse.data)
    if (applicationResponse.success && applicationResponse.data) setApplications(applicationResponse.data)
    if (groupResponse.success && groupResponse.data) setGroups(groupResponse.data)
    if (reservationResponse.success && reservationResponse.data) setReservations(reservationResponse.data)
  }, [])

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      router.push(getLoginPath(pathname, searchParams))
      return
    }
    if (!user.nickname) {
      router.push('/profile')
      return
    }
    void fetchData().finally(() => setLoading(false))
  }, [authLoading, fetchData, pathname, router, searchParams, user])

  const targetStudios = useMemo(() => {
    const today = getJSTDateString(new Date())
    const tomorrow = addJSTDays(today, 1)
    const max = addJSTDays(today, 14)
    return studios.filter((studio) => {
      const studioDate = getJSTDateString(studio.start_datetime)
      return studioDate >= tomorrow && studioDate <= max
    })
  }, [studios])

  const eligibleStudios = useMemo(() => (
    targetStudios.filter((studio) => getLotteryDrawAt(getJSTDateString(studio.start_datetime)) > new Date())
  ), [targetStudios])

  const applicationsByStudio = useMemo(() => {
    const grouped = new Map<string, ExternalLotteryApplication[]>()
    applications.forEach((application) => {
      const current = grouped.get(application.external_studio_id) || []
      current.push(application)
      grouped.set(application.external_studio_id, current)
    })
    return grouped
  }, [applications])

  const myGroupIds = useMemo(() => new Set(groups.map((group) => group.id)), [groups])

  const resetForm = () => {
    setIdentity('__personal__')
    setStudioId('')
    setPreferredStart('')
    setPreferredEnd('')
    setDuration('')
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const studio = studios.find((item) => item.id === studioId)
    if (!studio) return
    if ((preferredStart === '') !== (preferredEnd === '')) {
      toast.error('希望開始と希望終了は両方入力してください')
      return
    }
    if (!duration) {
      toast.error('希望利用時間を入力してください')
      return
    }
    const date = getJSTDateString(studio.start_datetime)
    try {
      setSubmitting(true)
      const response = await apiClient.createExternalLotteryApplication({
        external_studio_id: studio.id,
        group_id: identity === '__personal__' ? null : identity,
        preferred_start_datetime: preferredStart ? new Date(`${date}T${preferredStart}:00+09:00`).toISOString() : null,
        preferred_end_datetime: preferredEnd ? new Date(`${date}T${preferredEnd}:00+09:00`).toISOString() : null,
        requested_duration_minutes: Number(duration),
      })
      if (!response.success) {
        toast.error('抽選申込を作成できませんでした', { description: translateError(response.error || 'UNKNOWN_ERROR') })
        return
      }
      showSuccessToast({ message: '外部スタジオ抽選に申し込みました' })
      setOpen(false)
      resetForm()
      await fetchData()
    } catch (error) {
      toast.error('抽選申込を作成できませんでした', { description: translateError((error as Error).message) })
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancel = async (id: string) => {
    try {
      const response = await apiClient.cancelExternalLotteryApplication(id)
      if (!response.success) {
        toast.error('抽選申込を取り消せませんでした', { description: translateError(response.error || 'UNKNOWN_ERROR') })
        return
      }
      showSuccessToast({ message: '抽選申込を取り消しました' })
      await fetchData()
    } catch (error) {
      toast.error('抽選申込を取り消せませんでした', { description: translateError((error as Error).message) })
    }
  }

  if (authLoading || loading) return <div className="p-5"><Skeleton className="h-[520px] w-full" /></div>

  return (
    <>
      <PageHeader rightActions={(
        <Button size="sm" onClick={() => setOpen(true)} disabled={eligibleStudios.length === 0}>
          <CalendarPlus className="h-4 w-4" />申込
        </Button>
      )} />
      <main className="w-full p-5">
        {targetStudios.length === 0 ? (
          <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">抽選対象の外部スタジオはありません</div>
        ) : (
            <div className="overflow-x-auto [transform:rotateX(180deg)]">
              <div className="grid min-w-max grid-flow-col auto-cols-[17rem] items-start gap-3 py-3 [transform:rotateX(180deg)]">
              {targetStudios.map((studio) => {
                const studioApplications = applicationsByStudio.get(studio.id) || []
                const isAccepting = getLotteryDrawAt(getJSTDateString(studio.start_datetime)) > new Date()
                const upcomingDrawTimes = getLotteryDrawTimes(studio).filter((drawAt) => drawAt > new Date())
                return (
                  <section key={studio.id} className="space-y-2">
                    <Card>
                      <CardContent className="space-y-1.5 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-sm font-semibold">
                            {format(new Date(studio.start_datetime), 'M月d日 H:mm', { locale: ja })}〜
                            {format(new Date(studio.end_datetime), 'M月d日 H:mm', { locale: ja })}
                          </div>
                          <Badge variant={isAccepting ? 'default' : 'outline'} className="shrink-0 px-1.5 text-[10px]">
                            {isAccepting ? '受付中' : '受付終了'}
                          </Badge>
                        </div>
                        <div className="truncate text-xs text-muted-foreground">{studio.room_names.join(' / ')}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {upcomingDrawTimes.length > 0
                            ? `抽選 ${upcomingDrawTimes.map((drawAt) => format(drawAt, 'M月d日 H:mm', { locale: ja })).join(', ')}`
                            : '抽選終了'}
                        </div>
                      </CardContent>
                    </Card>

                    <div className="flex items-center justify-between px-1 text-xs">
                      <span className="font-medium">申込状況</span>
                      <span className="text-muted-foreground">{studioApplications.length}件</span>
                    </div>

                    <div className="space-y-2">
                      {studioApplications.length === 0 ? (
                        <div className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">申込はありません</div>
                      ) : studioApplications.map((application) => {
                        const isRelated = (
                          application.user_id === user?.id || (application.group_id !== null && myGroupIds.has(application.group_id))
                        )
                        const canCancel = application.state === 'PENDING' && isRelated
                        const winningProbability = application.state === 'PENDING'
                          ? estimateWinningProbability(application, studio, studioApplications, reservations)
                          : null
                        return (
                          <Card key={application.id} className={isRelated ? 'border-2 border-foreground/80' : undefined}>
                            <CardContent className="space-y-1.5 p-2.5 text-xs">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="truncate font-medium">{application.group_name || application.user_name || '個人'}</div>
                                  <div className="text-[11px] text-muted-foreground">
                                    {application.group_id ? (application.is_main ? '本バンド' : '自由バンド') : '個人'}
                                  </div>
                                </div>
                                <div className="shrink-0">
                                  <Badge
                                    variant={application.state === 'WON' ? 'default' : application.state === 'LOST' ? 'destructive' : 'outline'}
                                    className="px-1.5 text-[10px]"
                                    title={application.state === 'PENDING'
                                      ? '部屋数、確定済み予約、希望条件の重なり、申込優先度から算出した推定値です。実際の抽選結果を保証するものではありません。'
                                      : undefined}
                                  >
                                    {application.state === 'PENDING' ? `当選確率 約${winningProbability}%` : stateLabel[application.state]}
                                  </Badge>
                                </div>
                              </div>
                              <div className="flex items-end gap-2">
                                <div className="grid min-w-0 flex-1 gap-0.5 text-muted-foreground">
                                  <div>希望時間帯 {application.preferred_start_datetime
                                    ? `${format(new Date(application.preferred_start_datetime), 'H:mm')}〜${format(new Date(application.preferred_end_datetime as string), 'H:mm')}`
                                    : '指定なし'}</div>
                                  <div>希望利用時間 {application.requested_duration_minutes ? `${application.requested_duration_minutes}分` : '未設定'}</div>
                                  {application.state !== 'PENDING' && application.state !== 'CANCELLED' && (
                                    <div>公平性 {application.fairness_score?.toFixed(1) ?? '-'}分 / 順位 {application.tie_break_rank ?? '-'}</div>
                                  )}
                                </div>
                                {canCancel && (
                                  <Button
                                    variant="destructive"
                                    size="sm"
                                    className="h-7 shrink-0 px-2 text-xs"
                                    onClick={() => void handleCancel(application.id)}
                                  >
                                    取消
                                  </Button>
                                )}
                              </div>
                              {application.state === 'WON' && (
                                <div className="rounded bg-muted p-2">
                                  <div>部屋 {application.assigned_room_number}. {application.assigned_room_name}</div>
                                  <div>{format(new Date(application.assigned_start_datetime as string), 'M月d日 H:mm')}〜{format(new Date(application.assigned_end_datetime as string), 'H:mm')}</div>
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        )
                      })}
                    </div>
                  </section>
                )
              })}
            </div>
          </div>
        )}
      </main>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>外部スタジオ抽選申込</DialogTitle>
            <DialogDescription>抽選は利用日前日の21:00に実施し、部屋は空き状況から自動で割り当てられます。</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label>予約名義</Label>
              <Select value={identity} onValueChange={setIdentity}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__personal__">個人（{user?.nickname || user?.name}）</SelectItem>
                  {groups.map((group) => <SelectItem key={group.id} value={group.id}>{group.name}（{group.is_main ? '本バンド' : '自由バンド'}）</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>時間枠</Label>
              <Select value={studioId} onValueChange={setStudioId}>
                <SelectTrigger><SelectValue placeholder="時間枠を選択" /></SelectTrigger>
                <SelectContent className="max-h-[240px]">
                  {eligibleStudios.map((studio) => (
                    <SelectItem key={studio.id} value={studio.id}>
                      {format(new Date(studio.start_datetime), 'M月d日 H:mm', { locale: ja })}〜{format(new Date(studio.end_datetime), 'H:mm', { locale: ja })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>希望開始</Label><Input type="time" step={300} value={preferredStart} onChange={(event) => setPreferredStart(event.target.value)} /></div>
              <div className="space-y-2"><Label>希望終了</Label><Input type="time" step={300} value={preferredEnd} onChange={(event) => setPreferredEnd(event.target.value)} /></div>
            </div>
            <div className="space-y-2">
              <Label>希望利用時間（必須）</Label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger><SelectValue placeholder="希望利用時間を選択" /></SelectTrigger>
                <SelectContent className="max-h-[220px]">
                  {durationOptions.map((minutes) => <SelectItem key={minutes} value={String(minutes)}>{minutes}分</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <LoadingButton type="submit" className="w-full" isLoading={submitting} disabled={!studioId || !duration}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}申し込む
            </LoadingButton>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
