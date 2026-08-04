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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import type { External, ExternalLotteryApplication } from '@shared-schemas'

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
  const [groups, setGroups] = useState<GroupOption[]>([])
  const [identity, setIdentity] = useState('__personal__')
  const [studioId, setStudioId] = useState('')
  const [preferredStart, setPreferredStart] = useState('')
  const [preferredEnd, setPreferredEnd] = useState('')
  const [duration, setDuration] = useState('none')

  const fetchData = useCallback(async () => {
    const [studioResponse, applicationResponse, groupResponse] = await Promise.all([
      apiClient.getExternals(),
      apiClient.getExternalLotteryApplications(),
      apiClient.getGroupOptions(false),
    ])
    if (studioResponse.success && studioResponse.data) setStudios(studioResponse.data)
    if (applicationResponse.success && applicationResponse.data) setApplications(applicationResponse.data)
    if (groupResponse.success && groupResponse.data) setGroups(groupResponse.data)
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

  const eligibleStudios = useMemo(() => {
    const today = getJSTDateString(new Date())
    const tomorrow = addJSTDays(today, 1)
    const max = addJSTDays(today, 14)
    return studios.filter((studio) => {
      const studioDate = getJSTDateString(studio.start_datetime)
      return studioDate >= tomorrow && studioDate <= max && getLotteryDrawAt(studioDate) > new Date()
    })
  }, [studios])

  const resetForm = () => {
    setIdentity('__personal__')
    setStudioId('')
    setPreferredStart('')
    setPreferredEnd('')
    setDuration('none')
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const studio = studios.find((item) => item.id === studioId)
    if (!studio) return
    if ((preferredStart === '') !== (preferredEnd === '')) {
      toast.error('希望開始と希望終了は両方入力してください')
      return
    }
    if (!preferredStart && duration === 'none') {
      toast.error('希望時間帯または希望利用時間を入力してください')
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
        requested_duration_minutes: duration === 'none' ? null : Number(duration),
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
        <Button size="sm" onClick={() => setOpen(true)}>
          <CalendarPlus className="h-4 w-4" />抽選に申し込む
        </Button>
      )} />
      <main className="mx-auto w-full max-w-5xl space-y-4 p-5">
        {applications.length === 0 ? (
          <div className="rounded-md border p-10 text-center text-sm text-muted-foreground">抽選申込はありません</div>
        ) : (
          applications.map((application) => (
            <Card key={application.id}>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-base">
                    {format(new Date(application.studio_start_datetime), 'M月d日 H:mm', { locale: ja })}〜
                    {format(new Date(application.studio_end_datetime), 'H:mm', { locale: ja })}
                  </CardTitle>
                  <Badge variant={application.state === 'WON' ? 'default' : application.state === 'LOST' ? 'destructive' : 'outline'}>
                    {stateLabel[application.state]}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
                <div><span className="font-medium">予約名義:</span> {application.group_name || application.user_name || '個人'}</div>
                <div><span className="font-medium">種別:</span> {application.group_id ? (application.is_main ? '本バンド' : '自由バンド') : '個人'}</div>
                <div><span className="font-medium">希望時間帯:</span> {application.preferred_start_datetime
                  ? `${format(new Date(application.preferred_start_datetime), 'H:mm')}〜${format(new Date(application.preferred_end_datetime as string), 'H:mm')}`
                  : '指定なし'}</div>
                <div><span className="font-medium">希望利用時間:</span> {application.requested_duration_minutes ? `${application.requested_duration_minutes}分` : '希望時間帯すべて'}</div>
                {application.state !== 'PENDING' && application.state !== 'CANCELLED' && (
                  <>
                    <div><span className="font-medium">公平性スコア:</span> {application.fairness_score?.toFixed(1) ?? '-'}分</div>
                    <div><span className="font-medium">同点抽選順位:</span> {application.tie_break_rank ?? '-'}</div>
                  </>
                )}
                {application.state === 'WON' && (
                  <div className="sm:col-span-2 rounded-md bg-muted p-3">
                    <div><span className="font-medium">割当ルーム:</span> {application.assigned_room_number}. {application.assigned_room_name}</div>
                    <div><span className="font-medium">割当時間:</span> {format(new Date(application.assigned_start_datetime as string), 'M月d日 H:mm')}〜{format(new Date(application.assigned_end_datetime as string), 'H:mm')}</div>
                  </div>
                )}
                {application.state === 'PENDING' && (
                  <div className="sm:col-span-2 flex justify-end">
                    <Button variant="outline" size="sm" onClick={() => void handleCancel(application.id)}>申込を取り消す</Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </main>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>外部スタジオ抽選申込</DialogTitle>
            <DialogDescription>抽選は利用日前日の21:00に実施し、ルームは空き状況から自動で割り当てられます。</DialogDescription>
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
              <Label>希望利用時間</Label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-[220px]">
                  <SelectItem value="none">指定しない（希望時間帯すべて）</SelectItem>
                  {durationOptions.map((minutes) => <SelectItem key={minutes} value={String(minutes)}>{minutes}分</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <LoadingButton type="submit" className="w-full" isLoading={submitting} disabled={!studioId}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}申し込む
            </LoadingButton>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
