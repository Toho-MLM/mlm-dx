'use client'

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  type HallLottery,
  type HallLotteryApplication,
  type HallLotteryBandType,
  CreateHallLotteryRequestSchema,
  CreateHallLotteryApplicationRequestSchema,
  validateReservationTime,
  isAdmin,
} from '@shared-schemas'
import { useAuth } from '@/app/context/AuthContext'
import { apiClient } from '@/lib/api'
import { translateError } from '@/lib/error-label'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'

const bandTypeLabels = { MAIN: '本バンド', FREE: '自由バンド' } as const

const labels = {
  OPEN: '受付中',
  DRAWING: '抽選処理中',
  COMPLETED: '抽選完了',
  CANCELLED: '中止',
}
const resultLabels = {
  PENDING: '抽選前',
  WON: '当選',
  LOST: '落選',
  CANCELLED: '取消済み',
}
const jst = (value: string) =>
  new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
const endAt = (start: string, minutes: number) =>
  new Date(new Date(start).getTime() + minutes * 60000).toISOString()

export function HallLotteries({
  mode = 'apply',
  createOpen = false,
  onCreateOpenChange,
}: {
  mode?: 'admin' | 'apply' | 'calendar'
  createOpen?: boolean
  onCreateOpenChange?: (open: boolean) => void
}) {
  const { user } = useAuth()
  const canApplyForAllBands = !!user && isAdmin(user.role)
  const [lotteries, setLotteries] = useState<HallLottery[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [applications, setApplications] = useState<HallLotteryApplication[]>([])
  const [groups, setGroups] = useState<
    { id: string; name: string; main_index: number | null }[]
  >([])
  const [groupId, setGroupId] = useState('')
  const [preferences, setPreferences] = useState(['', '', ''])
  const [loading, setLoading] = useState(true)
  const [applicationLoading, setApplicationLoading] = useState(false)
  const applicationRequest = useRef(0)
  const [error, setError] = useState('')
  const [applicationError, setApplicationError] = useState('')
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(Date.now())
  const [draft, setDraft] = useState({
    name: '',
    target_band_type: '' as HallLotteryBandType | '',
    start_date: '',
    end_date: '',
    deadline_date: '',
    duration_minutes: 120,
  })
  useEffect(() => {
    if (createOpen) {
      setDraft({
        name: '',
        target_band_type: '',
        start_date: '',
        end_date: '',
        deadline_date: '',
        duration_minutes: 120,
      })
    }
  }, [createOpen])
  const selected = lotteries.find((l) => l.id === selectedId)
  const eligibleGroups = groups.filter(
    (g) =>
      selected &&
      (g.main_index !== null ? 'MAIN' : 'FREE') === selected.target_band_type,
  )
  const selectedGroupId = eligibleGroups.some((g) => g.id === groupId)
    ? groupId
    : ''
  const accepting =
    selected?.state === 'OPEN' && new Date(selected.draw_at).getTime() > now

  const load = useCallback(async () => {
    try {
      setError('')
      const [response, groupResponse] = await Promise.all([
        apiClient.getHallLotteries(),
        mode === 'apply'
          ? apiClient.getGroupOptions(canApplyForAllBands)
          : Promise.resolve(null),
      ])
      if (groupResponse && (!groupResponse.success || !groupResponse.data))
        throw new Error(groupResponse.error || 'INTERNAL_SERVER_ERROR')
      if (groupResponse?.data) setGroups(groupResponse.data)
      if (!response.success || !response.data)
        throw new Error(response.error || 'INTERNAL_SERVER_ERROR')
      setLotteries(response.data)
      setSelectedId((current) =>
        response.data!.some((l) => l.id === current)
          ? current
          : response.data![0]?.id || '',
      )
    } catch (e) {
      setError(translateError((e as Error).message))
    } finally {
      setLoading(false)
    }
  }, [mode, canApplyForAllBands])
  const loadApplications = useCallback(async () => {
    if (!selectedId || mode === 'calendar') return
    const request = ++applicationRequest.current
    setApplicationLoading(true)
    setApplicationError('')
    try {
      const response = await apiClient.getHallLotteryApplications(selectedId)
      if (!response.success || !response.data)
        throw new Error(response.error || 'INTERNAL_SERVER_ERROR')
      if (request === applicationRequest.current) setApplications(response.data)
    } catch (e) {
      if (request === applicationRequest.current)
        setApplicationError(translateError((e as Error).message))
    } finally {
      if (request === applicationRequest.current) setApplicationLoading(false)
    }
  }, [selectedId, mode])
  useEffect(() => {
    void load()
  }, [load])
  useEffect(() => {
    setApplications([])
    setPreferences(['', '', ''])
    void loadApplications()
  }, [loadApplications])
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now())
      void load()
      void loadApplications()
    }, 30000)
    return () => clearInterval(timer)
  }, [load, loadApplications])

  async function mutate(
    action: () => Promise<{ success: boolean; error?: string }>,
    message: string,
  ) {
    setBusy(true)
    try {
      const result = await action()
      if (!result.success)
        throw new Error(result.error || 'INTERNAL_SERVER_ERROR')
      toast.success(message)
      onCreateOpenChange?.(false)
      await load()
      await loadApplications()
      setPreferences(['', '', ''])
    } catch (e) {
      toast.error(translateError((e as Error).message))
    } finally {
      setBusy(false)
    }
  }
  function apply(event: FormEvent) {
    event.preventDefault()
    if (!selected) return
    if (!preferences[1] && preferences[2]) {
      toast.error('第3希望の前に第2希望を入力してください')
      return
    }
    if (
      preferences
        .filter(Boolean)
        .some((p) => Number.isNaN(new Date(`${p}+09:00`).getTime()))
    ) {
      toast.error('希望日時を確認してください')
      return
    }
    const input = CreateHallLotteryApplicationRequestSchema.safeParse({
      group_id: selectedGroupId,
      preferences: preferences
        .filter(Boolean)
        .map((p) => new Date(`${p}+09:00`).toISOString()),
    })
    if (
      !input.success ||
      input.data.preferences.some((start) => {
        const day = new Date(new Date(start).getTime() + 9 * 3600000)
          .toISOString()
          .slice(0, 10)
        return (
          day < selected.start_date ||
          day > selected.end_date ||
          !validateReservationTime(
            start,
            endAt(start, selected.duration_minutes),
          ).isValid ||
          endAt(start, selected.duration_minutes) >
            new Date(`${day}T23:00:00+09:00`).toISOString()
        )
      })
    ) {
      toast.error('希望日時は重複させず、対象期間の6:00〜23:00に収めてください')
      return
    }
    void mutate(
      () => apiClient.createHallLotteryApplication(selected.id, input.data),
      '抽選に申し込みました',
    )
  }
  function create(event: FormEvent) {
    event.preventDefault()
    const input = CreateHallLotteryRequestSchema.safeParse(draft)
    if (!input.success) {
      toast.error('対象期間・締切日・利用時間を確認してください')
      return
    }
    void mutate(
      () => apiClient.createHallLottery(input.data),
      'ホール抽選を作成しました',
    )
  }
  if (loading)
    return (
      <p className="p-3 text-sm text-muted-foreground">
        ホール抽選を読み込み中…
      </p>
    )
  if (error)
    return (
      <div className="p-3 text-sm" role="alert">
        {error}
        <Button variant="outline" onClick={() => void load()}>
          再試行
        </Button>
      </div>
    )
  if (mode === 'calendar') {
    const protectedPeriods = lotteries.filter(
      (l) => l.state === 'OPEN' || l.state === 'DRAWING',
    )
    if (!protectedPeriods.length) return null
    return (
      <div className="flex flex-wrap gap-2 border-b p-2 text-sm">
        {protectedPeriods.map((l) => (
          <Link
            className="underline"
            href="/reservation/external/lottery"
            key={l.id}
          >
            {l.name}：{l.start_date}〜{l.end_date}（抽選完了まで通常予約不可）
          </Link>
        ))}
      </div>
    )
  }
  return (
    <section className="mb-5 space-y-3" aria-label="期間単位のホール抽選">
      <h2 className="text-lg font-semibold">ホール抽選</h2>
      {lotteries.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          ホールの抽選はありません
        </p>
      ) : (
        <>
          <Select
            value={selectedId}
            onValueChange={setSelectedId}
            disabled={busy}
          >
            <SelectTrigger aria-label="ホール抽選">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {lotteries.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.name}・{bandTypeLabels[l.target_band_type]}（{l.start_date}
                  〜{l.end_date}）
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selected && (
            <Card>
              <CardContent className="space-y-4 pt-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-medium">{selected.name}</h3>
                  <Badge variant="outline">
                    {selected.state === 'OPEN' && !accepting
                      ? '抽選待ち'
                      : labels[selected.state]}
                  </Badge>
                </div>
                <dl className="grid gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-muted-foreground">対象バンド</dt>
                    <dd>{bandTypeLabels[selected.target_band_type]}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">対象期間</dt>
                    <dd>
                      {selected.start_date}〜{selected.end_date}
                      ・各日6:00〜23:00
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">共通利用時間</dt>
                    <dd>{selected.duration_minutes}分</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">申込締切</dt>
                    <dd>{selected.deadline_date} 23:59まで（JST）</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">抽選</dt>
                    <dd>{jst(selected.draw_at)}（JST）</dd>
                  </div>
                </dl>
                {mode === 'admin' && selected.state === 'OPEN' && (
                  <Button
                    variant="destructive"
                    disabled={busy}
                    onClick={() =>
                      void mutate(
                        () => apiClient.cancelHallLottery(selected.id),
                        '抽選を中止しました',
                      )
                    }
                  >
                    抽選を中止
                  </Button>
                )}
                {mode === 'apply' && accepting && (
                  <form onSubmit={apply} className="space-y-3 border-t pt-4">
                    <Label htmlFor="hall-group">
                      {canApplyForAllBands ? '申込バンド' : '所属バンド'}
                    </Label>
                    <Select
                      value={selectedGroupId}
                      onValueChange={setGroupId}
                      disabled={busy}
                    >
                      <SelectTrigger id="hall-group">
                        <SelectValue placeholder="バンドを選択" />
                      </SelectTrigger>
                      <SelectContent>
                        {eligibleGroups.map((g) => (
                          <SelectItem key={g.id} value={g.id}>
                            {g.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {eligibleGroups.length === 0 && (
                      <p className="text-sm text-muted-foreground">
                        {canApplyForAllBands
                          ? '対象区分に一致する有効なバンドがありません'
                          : '対象区分に一致する所属バンドがありません'}
                      </p>
                    )}
                    <div className="grid gap-3 md:grid-cols-3">
                      {preferences.map((p, index) => (
                        <div key={index} className="min-w-0 space-y-1">
                          <Label htmlFor={`hall-preference-${index}`}>
                            第{index + 1}希望
                            {index === 0 ? '（必須）' : '（任意）'}
                          </Label>
                          <Input
                            className="min-w-0"
                            id={`hall-preference-${index}`}
                            type="datetime-local"
                            required={index === 0}
                            min={`${selected.start_date}T06:00`}
                            max={`${selected.end_date}T23:00`}
                            value={p}
                            disabled={busy}
                            onChange={(e) =>
                              setPreferences((old) =>
                                old.map((v, i) =>
                                  i === index ? e.target.value : v,
                                ),
                              )
                            }
                          />
                          {p && (
                            <p className="text-xs text-muted-foreground">
                              終了：
                              {jst(
                                endAt(`${p}+09:00`, selected.duration_minutes),
                              )}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      期間全体で1バンド1申込・最大1枠。当選予約は通常の予約上限に含みません。
                    </p>
                    <Button
                      type="submit"
                      disabled={
                        busy ||
                        !selectedGroupId ||
                        applicationLoading ||
                        !!applicationError ||
                        applications.some(
                          (a) =>
                            a.group_id === groupId && a.state !== 'CANCELLED',
                        )
                      }
                    >
                      {busy ? '送信中…' : '申し込む'}
                    </Button>
                  </form>
                )}
                <div className="space-y-2 border-t pt-3">
                  <h4 className="font-medium">申込・抽選結果</h4>
                  {applicationLoading ? (
                    <p className="text-sm">読み込み中…</p>
                  ) : applicationError ? (
                    <div role="alert">
                      {applicationError}
                      <Button
                        variant="outline"
                        onClick={() => void loadApplications()}
                      >
                        再試行
                      </Button>
                    </div>
                  ) : applications.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      申込はありません
                    </p>
                  ) : (
                    applications.map((a) => (
                      <div
                        key={a.id}
                        className="space-y-2 rounded-md border p-3 text-sm"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span>
                            {a.group_name}{' '}
                            <Badge
                              variant={
                                a.state === 'WON' ? 'default' : 'outline'
                              }
                            >
                              {resultLabels[a.state]}
                            </Badge>
                          </span>
                          {mode === 'apply' &&
                            accepting &&
                            a.state === 'PENDING' &&
                            (canApplyForAllBands ||
                              groups.some((g) => g.id === a.group_id)) && (
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={busy}
                                onClick={() =>
                                  void mutate(
                                    () =>
                                      apiClient.cancelHallLotteryApplication(
                                        selected.id,
                                        a.id,
                                      ),
                                    '申込を取り消しました',
                                  )
                                }
                              >
                                申込取消
                              </Button>
                            )}
                        </div>
                        {a.preferences.map((p, i) => (
                          <p key={p}>
                            第{i + 1}希望：{jst(p)}〜
                            {jst(endAt(p, selected.duration_minutes))}
                          </p>
                        ))}
                        {a.state === 'WON' &&
                          a.assigned_start &&
                          a.assigned_end && (
                            <p className="font-medium">
                              第{a.winning_rank}希望で当選：
                              {jst(a.assigned_start)}〜{jst(a.assigned_end)}
                            </p>
                          )}
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
      <Dialog
        open={mode === 'admin' && createOpen}
        onOpenChange={(value) => {
          if (!busy) onCreateOpenChange?.(value)
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>ホール抽選を追加</DialogTitle>
            <DialogDescription>
              締切日の翌日0:00（JST）に抽選します。
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={create} className="space-y-3">
            <div>
              <Label htmlFor="hall-name">抽選名</Label>
              <Input
                id="hall-name"
                required
                maxLength={100}
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="hall-target-band-type">対象バンド</Label>
              <Select
                value={draft.target_band_type}
                required
                disabled={busy}
                onValueChange={(value: HallLotteryBandType) =>
                  setDraft({ ...draft, target_band_type: value })
                }
              >
                <SelectTrigger id="hall-target-band-type">
                  <SelectValue placeholder="本バンド・自由バンドを選択" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MAIN">本バンド</SelectItem>
                  <SelectItem value="FREE">自由バンド</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(
              [
                ['start_date', '対象開始日'],
                ['end_date', '対象終了日'],
                ['deadline_date', '申込締切日'],
              ] as const
            ).map(([key, label]) => (
              <div key={key}>
                <Label htmlFor={`hall-${key}`}>{label}</Label>
                <Input
                  id={`hall-${key}`}
                  type="date"
                  required
                  value={draft[key]}
                  onChange={(e) =>
                    setDraft({ ...draft, [key]: e.target.value })
                  }
                />
              </div>
            ))}
            <div>
              <Label htmlFor="hall-duration">共通利用時間（分）</Label>
              <Input
                id="hall-duration"
                type="number"
                min={10}
                max={240}
                required
                value={draft.duration_minutes}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    duration_minutes: Number(e.target.value),
                  })
                }
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={busy}>
                {busy ? '作成中…' : '抽選を作成'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  )
}
