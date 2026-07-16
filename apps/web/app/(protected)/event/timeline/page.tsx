'use client'

import { useEffect, useMemo, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { apiClient } from '@/lib/api'
import { Event } from '@/app/types'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { LoadingButton } from '@/components/ui/loading-button'
import { toast } from 'sonner'
import { showSuccessToast } from '@/lib/utils'
import { useAuth } from '@/app/context/AuthContext'
import { isAdmin } from '@shared-schemas'
import { Skeleton } from '@/components/ui/skeleton'
import { ChevronUp, ChevronDown, X } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'

type TimelineRow = {
  entry_id: string
  group_id: string
  group_name: string
  start_time: string | null
  end_time: string | null
  position: number | null
  created_at: string
  is_virtual?: boolean
}

function toIsoFromEventDateAndTime(eventDateIso: string, hhmm: string): string {
  const date = new Date(eventDateIso)
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  const dateString = `${year}-${month}-${day}`
  const [hh, mm] = hhmm.split(':').map(Number)
  const jstDateTime = new Date(`${dateString}T${String(hh || 0).padStart(2, '0')}:${String(mm || 0).padStart(2, '0')}:00+09:00`)
  return jstDateTime.toISOString()
}

function formatTimeToHHMM(isoString: string | null): string {
  if (!isoString) return '未設定'
  const date = new Date(isoString)
  const jstMs = date.getTime() + 9 * 60 * 60 * 1000
  const jstDate = new Date(jstMs)
  const hh = String(jstDate.getUTCHours()).padStart(2, '0')
  const mm = String(jstDate.getUTCMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

function isoToHHMM(isoString: string | null): string {
  if (!isoString) return ''
  const date = new Date(isoString)
  const jstMs = date.getTime() + 9 * 60 * 60 * 1000
  const jstDate = new Date(jstMs)
  const hh = String(jstDate.getUTCHours()).padStart(2, '0')
  const mm = String(jstDate.getUTCMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

function TimelineContent() {
  const { user } = useAuth()
  const searchParams = useSearchParams()
  const [events, setEvents] = useState<Event[]>([])
  const [eventsLoading, setEventsLoading] = useState(true)
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [configured, setConfigured] = useState<TimelineRow[]>([])
  const [unconfigured, setUnconfigured] = useState<TimelineRow[]>([])
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingConfigured, setEditingConfigured] = useState<TimelineRow[]>([])
  const [editingUnconfigured, setEditingUnconfigured] = useState<TimelineRow[]>([])

  const selectedEvent = useMemo(() => events.find(e => e.id === selectedEventId) || null, [events, selectedEventId])

  useEffect(() => {
    const id = searchParams.get('eventId')
    setSelectedEventId(id)
  }, [searchParams])

  useEffect(() => {
    const init = async () => {
      try {
        setEventsLoading(true)
        const res = await apiClient.getEvents()
        if (res.success && res.data) setEvents(res.data)
      } finally {
        setEventsLoading(false)
      }
    }
    init()
  }, [])

  useEffect(() => {
    if (!selectedEventId && events.length > 0) {
      const now = new Date().getTime()
      const upcoming = events.filter(e => new Date(e.event_date).getTime() >= now)
      if (upcoming.length > 0) {
        const nearest = upcoming.reduce((best, cur) => (
          new Date(cur.event_date).getTime() < new Date(best.event_date).getTime() ? cur : best
        ), upcoming[0])
        setSelectedEventId(nearest.id)
      }
    }
    if (!selectedEventId) return
    const load = async () => {
      try {
        setLoading(true)
        const res = await apiClient.getTimeline(selectedEventId)
        if (res.success && res.data) {
          setConfigured(res.data.configured)
          setUnconfigured(res.data.unconfigured)
        }
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [selectedEventId, events])

  const startEditing = () => {
    setEditingConfigured(configured
      .map(r => ({
        ...r,
        start_time: r.start_time ? isoToHHMM(r.start_time) : null,
        end_time: r.end_time ? isoToHHMM(r.end_time) : null,
      })))
    setEditingUnconfigured(unconfigured)
    setEditing(true)
  }

  const cancelEditing = () => {
    setEditingConfigured([])
    setEditingUnconfigured([])
    setEditing(false)
  }

  const moveUp = (index: number) => {
    if (index <= 0) return
    const arr = [...editingConfigured]
    const tmp = arr[index - 1]
    arr[index - 1] = arr[index]
    arr[index] = tmp
    setEditingConfigured(arr)
  }

  const moveDown = (index: number) => {
    if (index >= editingConfigured.length - 1) return
    const arr = [...editingConfigured]
    const tmp = arr[index + 1]
    arr[index + 1] = arr[index]
    arr[index] = tmp
    setEditingConfigured(arr)
  }

  const addFromUnconfigured = (entryId: string) => {
    const idx = editingUnconfigured.findIndex(r => r.entry_id === entryId)
    if (idx === -1) return
    const item = editingUnconfigured[idx]
    const rest = [...editingUnconfigured]
    rest.splice(idx, 1)
    setEditingUnconfigured(rest)
    setEditingConfigured([...editingConfigured, { ...item, position: (editingConfigured.length + 1) }])
  }

  const removeFromConfigured = (entryId: string) => {
    const idx = editingConfigured.findIndex(r => r.entry_id === entryId)
    if (idx === -1) return
    const item = editingConfigured[idx]
    const rest = [...editingConfigured]
    rest.splice(idx, 1)
    setEditingConfigured(rest.map((r, i) => ({ ...r, position: i + 1 })))
    setEditingUnconfigured([{ ...item, position: null }, ...editingUnconfigured])
  }

  const setTime = (entryId: string, field: 'start_time' | 'end_time', value: string) => {
    const upd = editingConfigured.map(r => r.entry_id === entryId ? { ...r, [field]: value || null } : r)
    setEditingConfigured(upd)
  }

  const normalizeTimeOnChange = (v: string): string => {
    const digits = v.replace(/[^0-9]/g, '').slice(0, 4)
    const hh = digits.slice(0, 2)
    const mm = digits.slice(2, 4)
    if (digits.length <= 2) return hh
    return `${hh}:${mm}`
  }

  const clampTimeOnBlur = (v: string): string => {
    if (!/^\d{2}:\d{2}$/.test(v)) return ''
    let [h, m] = v.split(':').map((n) => parseInt(n, 10))
    if (Number.isNaN(h) || Number.isNaN(m)) return ''
    if (h < 0) h = 0; if (h > 23) h = 23
    if (m < 0) m = 0; if (m > 59) m = 59
    const hh = String(h).padStart(2, '0')
    const mm = String(m).padStart(2, '0')
    return `${hh}:${mm}`
  }

  const save = async () => {
    if (!selectedEvent) return
    try {
      setSaving(true)
      const items = [
        ...editingConfigured.map((r, i) => ({
          entry_id: r.entry_id,
          position: i + 1,
          start_time: r.start_time ? toIsoFromEventDateAndTime(selectedEvent.event_date, r.start_time) : null,
          end_time: r.end_time ? toIsoFromEventDateAndTime(selectedEvent.event_date, r.end_time) : null,
        })),
        ...editingUnconfigured.map(r => ({ entry_id: r.entry_id, position: null, start_time: null, end_time: null })),
      ]
      const res = await apiClient.updateTimeline(selectedEvent.id, { items })
      if (!res.success) {
        if (res.error === 'DUPLICATE_POSITION') toast.error('順番が重複しています')
        else if (res.error === 'INVALID_POSITION_SEQUENCE') toast.error('順番は1から連続する整数で指定してください')
        else if (res.error === 'INVALID_TIME_RANGE') toast.error('終了時刻は開始時刻より後である必要があります')
        else toast.error('保存に失敗しました')
        return
      }
      showSuccessToast({ message: 'タイムラインを保存しました' })
      cancelEditing()
      if (selectedEventId) {
        const loadRes = await apiClient.getTimeline(selectedEventId)
        if (loadRes.success && loadRes.data) {
          setConfigured(loadRes.data.configured)
          setUnconfigured(loadRes.data.unconfigured)
        }
      }
    } finally {
      setSaving(false)
    }
  }

  const rightActions = (
    <div className="flex items-center gap-2">
      <Select value={selectedEventId ?? ''} onValueChange={(v) => setSelectedEventId(v)} disabled={eventsLoading || events.length === 0}>
        <SelectTrigger>
          <SelectValue placeholder={eventsLoading ? '' : 'イベントを選択'} />
        </SelectTrigger>
        <SelectContent>
          {events
            .slice()
            .sort((a, b) => new Date(b.event_date).getTime() - new Date(a.event_date).getTime())
            .map(ev => (
              <SelectItem key={ev.id} value={ev.id}>{ev.title}</SelectItem>
            ))}
        </SelectContent>
      </Select>
      {selectedEventId && user && isAdmin(user.role) && (
        <Button size="sm" variant="outline" onClick={startEditing}>
          編集
        </Button>
      )}
    </div>
  )

  return (
    <>
      <PageHeader rightActions={rightActions} />
      <div className="p-4 pt-0 mx-auto space-y-4">
        {selectedEventId ? (
          selectedEvent ? (
            <Card className="max-w-4xl mx-auto w-full">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">{selectedEvent.title}</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-4">
                {loading ? (
                  <div className="text-gray-500">読み込み中</div>
                ) : (
                  <div className="grid grid-cols-1 gap-6">
                    <div>
                      <div className="text-sm font-medium mb-2">設定済み</div>
                      <div className="space-y-2">
                        {configured.length === 0 ? (
                          <div className="text-gray-400">なし</div>
                        ) : (
                          configured.map((r, i) => (
                            <div key={r.entry_id} className="flex items-center gap-3 p-3 border rounded-lg bg-gray-50">
                              <div className="w-8 text-center text-sm font-semibold">{i + 1}</div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <div className="font-medium truncate">{r.group_name}</div>
                                  {r.is_virtual && <Badge variant="outline">本バンド必須</Badge>}
                                </div>
                                <div className="text-sm text-gray-600">開始: {formatTimeToHHMM(r.start_time)} / 終了: {formatTimeToHHMM(r.end_time)}</div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-medium mb-2">未設定</div>
                      <div className="space-y-2">
                        {unconfigured.length === 0 ? (
                          <div className="text-gray-400">なし</div>
                        ) : (
                          unconfigured.map((r) => (
                            <div key={r.entry_id} className="flex items-center gap-3 p-3 border rounded-lg bg-gray-50">
                              <div className="w-8 text-center text-sm font-semibold">—</div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <div className="font-medium truncate">{r.group_name}</div>
                                  {r.is_virtual && <Badge variant="outline">本バンド必須</Badge>}
                                </div>
                                <div className="text-sm text-gray-600">開始: 未設定 / 終了: 未設定</div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            eventsLoading ? (
              <div className="max-w-4xl mx-auto w-full">
                <div className="space-y-3">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              </div>
            ) : (
              <div className="text-gray-500 text-center">直近のイベントがありません</div>
            )
          )
        ) : (
          eventsLoading ? (
            <div className="max-w-4xl mx-auto w-full">
              <div className="space-y-3">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            </div>
          ) : (
            events.length > 0 ? (
              <div className="text-gray-500 text-center">右上からイベントを選択してください</div>
            ) : (
              <div className="text-gray-500 text-center">直近のイベントがありません</div>
            )
          )
        )}
      </div>

      <Dialog open={editing} onOpenChange={(open) => { if (!open) cancelEditing() }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>タイムライン編集</DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            <div>
              <div className="text-sm font-medium mb-2">設定済み</div>
              <div className="space-y-2">
                {editingConfigured.map((r, i) => (
                  <div key={r.entry_id} className="relative flex items-center gap-3 p-3 border rounded-lg bg-gray-50 pr-12">
                    <div className="w-8 text-center text-sm font-semibold">{i + 1}</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{r.group_name}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <Input
                          type="text"
                          inputMode="numeric"
                          maxLength={5}
                          placeholder="HH:MM"
                          value={r.start_time || ''}
                          onChange={(e) => setTime(r.entry_id, 'start_time', normalizeTimeOnChange(e.target.value))}
                          onBlur={(e) => setTime(r.entry_id, 'start_time', clampTimeOnBlur(e.target.value))}
                        />
                        <span className="text-gray-400 text-sm">-</span>
                        <Input
                          type="text"
                          inputMode="numeric"
                          maxLength={5}
                          placeholder="HH:MM"
                          value={r.end_time || ''}
                          onChange={(e) => setTime(r.entry_id, 'end_time', normalizeTimeOnChange(e.target.value))}
                          onBlur={(e) => setTime(r.entry_id, 'end_time', clampTimeOnBlur(e.target.value))}
                        />
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 items-stretch">
                      <Button variant="outline" size="icon" onClick={() => moveUp(i)} disabled={i === 0} aria-label="上へ">
                        <ChevronUp className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="icon" onClick={() => moveDown(i)} disabled={i === editingConfigured.length - 1} aria-label="下へ">
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeFromConfigured(r.entry_id)}
                      aria-label="外す"
                      className="absolute top-2 right-2 z-10"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="text-sm font-medium mb-2">未設定</div>
              <div className="space-y-2">
                {editingUnconfigured.map((r) => (
                  <div key={r.entry_id} className="flex items-center gap-3 p-3 border rounded-lg bg-gray-50">
                    <div className="w-8 text-center text-sm font-semibold">—</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{r.group_name}</div>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => addFromUnconfigured(r.entry_id)}>追加</Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={cancelEditing}>閉じる</Button>
              <LoadingButton
                isLoading={saving}
                onClick={async () => {
                  if (!selectedEvent) return
                  for (const r of editingConfigured) {
                    if (r.start_time && r.end_time) {
                      const start = toIsoFromEventDateAndTime(selectedEvent.event_date, r.start_time)
                      const end = toIsoFromEventDateAndTime(selectedEvent.event_date, r.end_time)
                      if (new Date(start) >= new Date(end)) {
                        toast.error('終了時刻は開始時刻より後である必要があります')
                        return
                      }
                    }
                  }
                  await save()
                }}
              >保存</LoadingButton>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default function Page() {
  return (
    <Suspense fallback={
      <>
        <PageHeader />
        <div className="p-4 pt-0 mx-auto space-y-4">
          <div className="max-w-4xl mx-auto w-full">
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          </div>
        </div>
      </>
    }>
      <TimelineContent />
    </Suspense>
  )
}
