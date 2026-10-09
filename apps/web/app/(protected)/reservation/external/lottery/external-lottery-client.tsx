'use client'

import { BandTypeBadge } from '@/components/band-type-badge'
import { ToastNotice } from '@/components/toast-notice'

import { Suspense, useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import { CalendarPlus, Loader2 } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { toast } from '@/lib/toast'
import { useAuth } from '@/app/context/AuthContext'
import { HallLotteries } from '@/components/hall-lotteries'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LoadingButton } from '@/components/ui/loading-button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { apiClient } from '@/lib/api'
import { getLoginPath } from '@/lib/auth-redirect'
import { translateError } from '@/lib/error-label'
import { showSuccessToast } from '@/lib/utils'
import { toJSTWallClockDate } from '../../reservation-calendar'
import {
  EXTERNAL_LOTTERY_MAX_DURATION_MINUTES,
  EXTERNAL_LOTTERY_MIN_DURATION_MINUTES,
  type External,
  type ExternalLotteryApplication,
} from '@shared-schemas'

type GroupOption = { id: string; name: string; main_index: number | null }

const stateLabel = { PENDING: '抽選前', WON: '当選', LOST: '落選', CANCELLED: '取消' } as const
const getJSTDateString = (value: Date | string) => {
  const date = typeof value === 'string' ? new Date(value) : value
  return new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}
const toJSTLocalInputValue = (value: Date) => (
  new Date(value.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 16)
)
const formatJST = (value: Date | string, pattern: string) => (
  format(toJSTWallClockDate(value), pattern, { locale: ja })
)
const addJSTDays = (dateString: string, days: number) => {
  const date = new Date(`${dateString}T00:00:00+09:00`)
  date.setUTCDate(date.getUTCDate() + days)
  return getJSTDateString(date)
}
const getLotteryDrawAt = (studio: External, studioDate: string) => {
  if (studio.target_type === 'HALL' && studio.draw_datetime) {
    return new Date(studio.draw_datetime)
  }
  const drawAt = new Date(`${studioDate}T21:00:00+09:00`)
  drawAt.setUTCDate(drawAt.getUTCDate() - 1)
  return drawAt
}

type LotterySlot = { id: string; studio: External; date: string; start: Date; latestStart: Date; end: Date; drawAt: Date }

const getLotterySlots = (studio: External): LotterySlot[] => {
  const slots: LotterySlot[] = []
  const studioStart = new Date(studio.start_datetime)
  const studioEnd = new Date(studio.end_datetime)
  let studioDate = getJSTDateString(studio.start_datetime)
  const lastStudioDate = getJSTDateString(new Date(studioEnd.getTime() - 1))
  while (studioDate <= lastStudioDate) {
    const dayStart = new Date(`${studioDate}T00:00:00+09:00`)
    const nextDayStart = new Date(`${addJSTDays(studioDate, 1)}T00:00:00+09:00`)
    const start = new Date(Math.max(studioStart.getTime(), dayStart.getTime()))
    const latestStart = new Date(Math.min(
      studioEnd.getTime() - EXTERNAL_LOTTERY_MIN_DURATION_MINUTES * 60_000,
      nextDayStart.getTime() - 60_000
    ))
    if (latestStart >= start) {
      const end = new Date(Math.min(
        studioEnd.getTime(),
        latestStart.getTime() + EXTERNAL_LOTTERY_MAX_DURATION_MINUTES * 60_000
      ))
      slots.push({ id: `${studio.id}:${studioDate}`, studio, date: studioDate, start, latestStart, end, drawAt: getLotteryDrawAt(studio, studioDate) })
    }
    studioDate = addJSTDays(studioDate, 1)
  }
  return slots
}

const getLotteryDrawTimes = (studio: External) => getLotterySlots(studio).map((slot) => slot.drawAt)

export type ExternalLotteryInitialData = {
  studios: External[] | null
  applications: ExternalLotteryApplication[] | null
  groups: GroupOption[] | null
}

export function ExternalLotteryClient({ initialData }: { initialData?: ExternalLotteryInitialData }) {
  return <Suspense fallback={<div className="p-5"><Skeleton className="h-[520px] w-full" /></div>}><ExternalLotteryContent initialData={initialData} /></Suspense>
}

function ExternalLotteryContent({ initialData }: { initialData?: ExternalLotteryInitialData }) {
  const hasCompleteInitialData = initialData !== undefined
    && initialData.studios !== null
    && initialData.applications !== null
    && initialData.groups !== null
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { user, loading: authLoading } = useAuth()
  const [loading, setLoading] = useState(!hasCompleteInitialData)
  const [loadError, setLoadError] = useState<string | null>(initialData && Object.values(initialData).some((value) => value === null) ? '抽選情報を読み込めませんでした。' : null)
  const [submitting, setSubmitting] = useState(false)
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [studios, setStudios] = useState<External[]>(initialData?.studios ?? [])
  const [applications, setApplications] = useState<ExternalLotteryApplication[]>(initialData?.applications ?? [])
  const [groups, setGroups] = useState<GroupOption[]>(initialData?.groups ?? [])
  const [identity, setIdentity] = useState('__personal__')
  const [studioId, setStudioId] = useState('')
  const [preferredStart, setPreferredStart] = useState('')
  const [preferredEnd, setPreferredEnd] = useState('')
  const [duration, setDuration] = useState('')

  const fetchData = useCallback(async () => {
    setLoadError(null)
    try {
      const [studioResponse, applicationResponse, groupResponse] = await Promise.all([
        apiClient.getExternals(),
        apiClient.getExternalLotteryApplications(),
        apiClient.getGroupOptions(false),
      ])
      const failedResponse = [studioResponse, applicationResponse, groupResponse]
        .find((response) => !response.success || !response.data)
      if (failedResponse) throw new Error(failedResponse.error || 'EXTERNAL_LOTTERY_FETCH_FAILED')
      setStudios(studioResponse.data || [])
      setApplications(applicationResponse.data || [])
      setGroups(groupResponse.data || [])
    } catch (error) {
      console.error('Failed to fetch external lottery data:', error)
      setLoadError(translateError((error as Error).message))
    }
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
    if (hasCompleteInitialData) return
    void fetchData().finally(() => setLoading(false))
  }, [authLoading, fetchData, hasCompleteInitialData, pathname, router, searchParams, user])

  const targetStudios = useMemo(() => {
    const now = new Date()
    return studios.filter((studio) => new Date(studio.end_datetime) >= now)
  }, [studios])

  const eligibleSlots = useMemo(() => {
    const now = new Date()
    const today = getJSTDateString(now)
    const tomorrow = addJSTDays(today, 1)
    const max = addJSTDays(today, 14)
    return targetStudios.flatMap(getLotterySlots).filter((slot) => (
      slot.date >= tomorrow && slot.date <= max && slot.drawAt > now
    ))
  }, [targetStudios])
  const selectedSlot = eligibleSlots.find((slot) => slot.id === studioId)

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
    const slot = eligibleSlots.find((item) => item.id === studioId)
    if (!slot) return
    if ((preferredStart === '') !== (preferredEnd === '')) {
      toast.error('許容時間（起点）と許容時間（終点）は両方入力してください')
      return
    }
    if (!duration) {
      toast.error('希望利用時間を入力してください')
      return
    }
    try {
      setSubmitting(true)
      const response = await apiClient.createExternalLotteryApplication({
        external_studio_id: slot.studio.id,
        group_id: identity === '__personal__' ? null : identity,
        preferred_start_datetime: preferredStart
          ? new Date(`${preferredStart}:00+09:00`).toISOString()
          : slot.start.toISOString(),
        preferred_end_datetime: preferredEnd
          ? new Date(`${preferredEnd}:00+09:00`).toISOString()
          : slot.end.toISOString(),
        requested_duration_minutes: Number(duration),
      })
      if (!response.success) {
        toast.error('抽選申込を作成できませんでした', { description: translateError(response.error || 'UNKNOWN_ERROR') })
        return
      }
      showSuccessToast({ message: '抽選に申し込みました' })
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
    if (cancellingId) return
    try {
      setCancellingId(id)
      const response = await apiClient.cancelExternalLotteryApplication(id)
      if (!response.success) {
        toast.error('抽選申込を取り消せませんでした', { description: translateError(response.error || 'UNKNOWN_ERROR') })
        return
      }
      showSuccessToast({ message: '抽選申込を取り消しました' })
      await fetchData()
    } catch (error) {
      toast.error('抽選申込を取り消せませんでした', { description: translateError((error as Error).message) })
    } finally {
      setCancellingId(null)
    }
  }

  if (authLoading || loading) return <div className="p-5"><Skeleton className="h-[520px] w-full" /></div>

  return (
    <>
      <PageHeader rightActions={(
        <Button size="sm" onClick={() => setOpen(true)} disabled={Boolean(loadError) || eligibleSlots.length === 0}>
          <CalendarPlus className="h-4 w-4" />外部等の申込
        </Button>
      )} />
      <main className="w-full p-5">
        <HallLotteries />
        {loadError ? (
          <ToastNotice message={loadError} retry={() => void fetchData()} />
        ) : targetStudios.length === 0 ? (
          <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">外部抽選対象 0件</div>
        ) : (
            <div className="overflow-x-auto [transform:rotateX(180deg)]">
              <div className="grid min-w-max grid-flow-col auto-cols-[17rem] items-start gap-3 py-3 [transform:rotateX(180deg)]">
              {targetStudios.map((studio) => {
                const studioApplications = applicationsByStudio.get(studio.id) || []
                const isAccepting = getLotteryDrawTimes(studio).some((drawAt) => drawAt > new Date())
                const upcomingDrawTimes = getLotteryDrawTimes(studio).filter((drawAt) => drawAt > new Date())
                return (
                  <section key={studio.id} className="space-y-2">
                    <Card>
                      <CardContent className="space-y-1.5 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-sm font-semibold">
                            <Badge variant="outline" className="mr-1.5">{studio.target_type === 'HALL' ? 'ホール' : '外部'}</Badge>
                            {formatJST(studio.start_datetime, 'M月d日 H:mm')}〜
                            {formatJST(studio.end_datetime, 'M月d日 H:mm')}
                          </div>
                          <Badge variant={isAccepting ? 'default' : 'outline'} className="shrink-0 px-1.5 text-[10px]">
                            {isAccepting ? '受付中' : '受付終了'}
                          </Badge>
                        </div>
                        {studio.target_type === 'EXTERNAL' && <div className="truncate text-xs text-muted-foreground">{studio.room_names.join(' / ')}</div>}
                        <div className="text-[11px] text-muted-foreground">
                          {upcomingDrawTimes.length > 0
                            ? `抽選 ${upcomingDrawTimes.map((drawAt) => formatJST(drawAt, 'M月d日 H:mm')).join(', ')}`
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
                        <div className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">申込 0件</div>
                      ) : studioApplications.map((application) => {
                        const isRelated = (
                          application.user_id === user?.id || (application.group_id !== null && myGroupIds.has(application.group_id))
                        )
                        const canCancel = application.state === 'PENDING' && isRelated
                        return (
                          <Card key={application.id} className={isRelated ? 'border-2 border-black' : undefined}>
                            <CardContent className="space-y-1.5 p-2.5 text-xs">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="truncate font-medium">{application.group_name || application.user_name || '個人'}</div>
                                  <div className="text-[11px] text-muted-foreground">
                                    {application.group_id ? <BandTypeBadge mainIndex={application.main_index} className="text-[10px]" /> : '個人'}
                                  </div>
                                </div>
                                <div className="shrink-0">
                                  <Badge
                                    variant={application.state === 'WON' ? 'default' : application.state === 'LOST' ? 'destructive' : 'outline'}
                                    className="px-1.5 text-[10px]"
                                  >
                                    {stateLabel[application.state]}
                                  </Badge>
                                </div>
                              </div>
                              <div className="flex items-end gap-2">
                                <div className="grid min-w-0 flex-1 gap-0.5 text-muted-foreground">
                                  <div>許容時間 {application.preferred_start_datetime
                                    ? `${formatJST(application.preferred_start_datetime, 'H:mm')}〜${formatJST(application.preferred_end_datetime as string, 'H:mm')}`
                                    : '指定なし'}</div>
                                  <div>希望利用時間 {application.requested_duration_minutes ? `${application.requested_duration_minutes}分` : '未設定'}</div>
                                  {application.state !== 'PENDING' && application.state !== 'CANCELLED' && (
                                    <div>公平性 {application.fairness_score?.toFixed(1) ?? '-'}分</div>
                                  )}
                                </div>
                                {canCancel && (
                                  <Button
                                    variant="destructive"
                                    size="sm"
                                    className="h-7 shrink-0 px-2 text-xs"
                                    disabled={cancellingId !== null}
                                    onClick={() => void handleCancel(application.id)}
                                  >
                                    {cancellingId === application.id && <Loader2 className="h-3 w-3 animate-spin" />}取消
                                  </Button>
                                )}
                              </div>
                              {application.state === 'WON' && (
                                <div className="rounded bg-muted p-2">
                                  <div>{application.target_type === 'HALL'
                                    ? 'ホール'
                                    : `部屋 ${application.assigned_room_number}. ${application.assigned_room_name}`}</div>
                                  <div>{formatJST(application.assigned_start_datetime as string, 'M月d日 H:mm')}〜{formatJST(application.assigned_end_datetime as string, 'H:mm')}</div>
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
            <DialogTitle>抽選申込</DialogTitle>
            <DialogDescription>抽選は対象に表示された日時に実施し、場所と時間は空き状況から自動で割り当てられます。</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="external-lottery-identity">予約名義</Label>
              <Select value={identity} onValueChange={setIdentity}>
                <SelectTrigger id="external-lottery-identity"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__personal__">個人（{user?.nickname || user?.name}）</SelectItem>
                  {groups.map((group) => <SelectItem key={group.id} value={group.id}><span className="flex flex-wrap items-center gap-2">{group.name}<BandTypeBadge mainIndex={group.main_index} /></span></SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="external-lottery-slot">時間枠</Label>
              <Select value={studioId} onValueChange={(value) => {
                setStudioId(value)
                setPreferredStart('')
                setPreferredEnd('')
              }}>
                <SelectTrigger id="external-lottery-slot"><SelectValue placeholder="時間枠を選択" /></SelectTrigger>
                <SelectContent className="max-h-[240px]">
                  {eligibleSlots.map((slot) => (
                    <SelectItem key={slot.id} value={slot.id}>
                      {slot.studio.target_type === 'HALL' ? 'ホール' : '外部'}・{formatJST(slot.start, 'M月d日 H:mm')}〜{formatJST(slot.end, 'M月d日 H:mm')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="external-lottery-start">許容時間（起点）</Label><Input id="external-lottery-start" type="datetime-local" step={60} min={selectedSlot ? toJSTLocalInputValue(selectedSlot.start) : undefined} max={selectedSlot ? toJSTLocalInputValue(selectedSlot.latestStart) : undefined} disabled={!selectedSlot} value={preferredStart} onChange={(event) => setPreferredStart(event.target.value)} /></div>
              <div className="space-y-2"><Label htmlFor="external-lottery-end">許容時間（終点）</Label><Input id="external-lottery-end" type="datetime-local" step={60} min={preferredStart || (selectedSlot ? toJSTLocalInputValue(selectedSlot.start) : undefined)} max={selectedSlot ? toJSTLocalInputValue(selectedSlot.end) : undefined} disabled={!selectedSlot} value={preferredEnd} onChange={(event) => setPreferredEnd(event.target.value)} /></div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="external-lottery-duration">希望利用時間（分）</Label>
              <Input
                id="external-lottery-duration"
                type="number"
                min={EXTERNAL_LOTTERY_MIN_DURATION_MINUTES}
                max={EXTERNAL_LOTTERY_MAX_DURATION_MINUTES}
                step={1}
                value={duration}
                onChange={(event) => setDuration(event.target.value)}
                placeholder={`${EXTERNAL_LOTTERY_MIN_DURATION_MINUTES}〜${EXTERNAL_LOTTERY_MAX_DURATION_MINUTES}`}
                required
              />
            </div>
            <DialogFooter>
              <LoadingButton type="submit" isLoading={submitting} disabled={!studioId || !duration}>
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}申し込む
              </LoadingButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
