'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Calendar as BigCalendar, dateFnsLocalizer, Navigate, Views, type View } from 'react-big-calendar'
import { format, getDay, parse, startOfDay, startOfWeek, addDays, subDays } from 'date-fns'
import { ja as jaLocale } from 'date-fns/locale'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, Loader2, Plus, Trash2 } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { ReservationPageHeader } from '@/components/reservation-page-header'
import { Button } from '@/components/ui/button'
import { Calendar as CalendarPrimitive } from '@/components/ui/calendar'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LoadingButton } from '@/components/ui/loading-button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription } from '@/components/ui/card'
import { cn, showSuccessToast } from '@/lib/utils'
import { translateError } from '@/lib/error-label'
import { apiClient } from '@/lib/api'
import { getLoginPath } from '@/lib/auth-redirect'
import { useAuth } from '@/app/context/AuthContext'
import { eventStateNames, ReservationState } from '@/app/types'
import { isAdmin, validateReservationTime, type External, type ExternalReservation, type ExternalReservationConflict } from '@shared-schemas'
import { useAdminMode } from '@/hooks/use-admin-mode'

type GroupOption = {
  id: string
  name: string
  is_main: boolean
}

type ExternalResource = {
  id: string
  title: string
}

type ExternalDraft = {
  date: Date
  externalId: string | null
  groupId: string | null
  startHour: number | null
  startMinute: number | null
  endHour: number | null
  endMinute: number | null
}

type CalendarEvent = {
  id: string
  title: string
  start: Date
  end: Date
  resourceId: string
  allDay: boolean
  meta: {
    reservationId: string
    externalName: string
    userName?: string
    groupName?: string
    state: ReservationState
    cancellable: number
  }
}

const locales = { ja: jaLocale }

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
})

const messages = {
  day: '日',
  previous: '前',
  next: '次',
  today: '今日',
  agenda: 'リスト',
  showMore: (total: number) => `+${total} 件`,
}

const generateHourOptions = (start: number, count: number) => Array.from({ length: count }, (_, i) => i + start)
const generateMinuteOptions = () => Array.from({ length: 12 }, (_, i) => i * 5)

export default function ExternalReservationPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { user, loading: authLoading } = useAuth()
  const [isAdminMode, setIsAdminMode] = useAdminMode(user && isAdmin(user.role))
  const [loading, setLoading] = useState(true)
  const [currentDate, setCurrentDate] = useState(new Date())
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false)
  const [externals, setExternals] = useState<External[]>([])
  const [reservations, setReservations] = useState<ExternalReservation[]>([])
  const [myGroups, setMyGroups] = useState<GroupOption[]>([])
  const [isGroupsLoading, setIsGroupsLoading] = useState(false)
  const [isReservationFormOpen, setIsReservationFormOpen] = useState(false)
  const [isManageOpen, setIsManageOpen] = useState(false)
  const [selectedReservation, setSelectedReservation] = useState<CalendarEvent | null>(null)
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [isCreatingExternal, setIsCreatingExternal] = useState(false)
  const [deletingExternalId, setDeletingExternalId] = useState<string | null>(null)
  const [externalNames, setExternalNames] = useState<string[]>([''])
  const [externalStartDate, setExternalStartDate] = useState<Date | undefined>(new Date())
  const [externalStartTime, setExternalStartTime] = useState('00:00')
  const [externalEndDate, setExternalEndDate] = useState<Date | undefined>(addDays(new Date(), 1))
  const [externalEndTime, setExternalEndTime] = useState('00:00')
  const [conflicts, setConflicts] = useState<ExternalReservationConflict[]>([])
  const [pendingDraft, setPendingDraft] = useState<ExternalDraft | null>(null)
  const [isConflictDialogOpen, setIsConflictDialogOpen] = useState(false)
  const [draft, setDraft] = useState<ExternalDraft>({
    date: startOfDay(new Date()),
    externalId: null,
    groupId: null,
    startHour: null,
    startMinute: null,
    endHour: null,
    endMinute: null,
  })

  const fetchGroups = useCallback(async () => {
    if (isGroupsLoading) return
    try {
      setIsGroupsLoading(true)
      const response = await apiClient.getGroupOptions(isAdminMode)
      if (response.success && response.data) {
        setMyGroups(response.data)
      }
    } catch (error) {
      console.error('Failed to fetch groups:', error)
    } finally {
      setIsGroupsLoading(false)
    }
  }, [isAdminMode, isGroupsLoading])

  const fetchData = useCallback(async () => {
    const [externalsResponse, reservationsResponse] = await Promise.all([
      apiClient.getExternals(),
      apiClient.getExternalReservations(isAdminMode),
    ])

    if (externalsResponse.success && externalsResponse.data) {
      setExternals(externalsResponse.data)
    }

    if (reservationsResponse.success && reservationsResponse.data) {
      setReservations(reservationsResponse.data)
    }
  }, [isAdminMode])

  useEffect(() => {
    const init = async () => {
      if (authLoading) return
      if (!user) {
        router.push(getLoginPath(pathname, searchParams))
        return
      }
      if (!user.nickname) {
        router.push('/profile')
        return
      }

      try {
        await fetchData()
      } finally {
        setLoading(false)
      }
    }

    void init()
  }, [authLoading, fetchData, router, user, pathname, searchParams])

  useEffect(() => {
    if (!user) return

    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let closedByComponent = false
    let socket: WebSocket | null = null

    const connect = () => {
      socket = new WebSocket(apiClient.getReservationsWebSocketUrl())

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(String(event.data)) as { type?: string }
          if (message.type === 'reservations_changed') {
            void fetchData()
          }
        } catch {
          // Ignore malformed realtime messages.
        }
      }

      socket.onclose = () => {
        if (!closedByComponent) {
          reconnectTimer = setTimeout(connect, 3000)
        }
      }

      socket.onerror = () => {
        socket?.close()
      }
    }

    connect()

    return () => {
      closedByComponent = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      socket?.close()
    }
  }, [fetchData, user])

  const visibleExternals = useMemo(() => {
    const dayStart = startOfDay(currentDate)
    const dayEnd = addDays(dayStart, 1)
    return externals.filter((external) => (
      new Date(external.start_datetime) < dayEnd && new Date(external.end_datetime) > dayStart
    ))
  }, [currentDate, externals])

  const resources: ExternalResource[] = useMemo(() => (
    visibleExternals.map((external) => ({ id: external.id, title: external.name }))
  ), [visibleExternals])

  const calendarEvents: CalendarEvent[] = useMemo(() => (
    reservations.map((reservation) => ({
      id: reservation.id,
      title: reservation.group_name || '外部予約',
      start: new Date(reservation.start_time),
      end: new Date(reservation.end_time),
      resourceId: reservation.external_studio_id,
      allDay: false,
      meta: {
        reservationId: reservation.id,
        externalName: reservation.external_name || '外部スタジオ',
        userName: reservation.user_name || undefined,
        groupName: reservation.group_name || undefined,
        state: reservation.state as ReservationState,
        cancellable: reservation.cancellable,
      },
    }))
  ), [reservations])

  const selectableExternals = useMemo(() => {
    const selectedDate = draft.date
    const dayStart = startOfDay(selectedDate)
    const dayEnd = addDays(dayStart, 1)
    return externals.filter((external) => (
      new Date(external.start_datetime) < dayEnd && new Date(external.end_datetime) > dayStart
    ))
  }, [draft.date, externals])

  const handleInputChange = (name: keyof ExternalDraft, value: number | Date | string | null) => {
    setDraft((prev) => {
      const next = { ...prev, [name]: value }
      if (name === 'date') next.externalId = null
      if (name === 'startHour') {
        next.startMinute = null
        next.endHour = null
        next.endMinute = null
      }
      if (name === 'startMinute') {
        next.endHour = null
        next.endMinute = null
      }
      if (name === 'endHour') next.endMinute = null
      return next
    })
  }

  const getDraftTimes = (targetDraft: ExternalDraft) => {
    if (
      targetDraft.startHour === null ||
      targetDraft.startMinute === null ||
      targetDraft.endHour === null ||
      targetDraft.endMinute === null
    ) {
      return null
    }

    const start = new Date(targetDraft.date)
    start.setHours(targetDraft.startHour, targetDraft.startMinute, 0, 0)
    const end = new Date(targetDraft.date)
    end.setHours(targetDraft.endHour, targetDraft.endMinute, 0, 0)
    return { start, end }
  }

  const submitReservation = async (targetDraft: ExternalDraft, acknowledged: boolean) => {
    if (!targetDraft.externalId || !targetDraft.groupId) return
    const times = getDraftTimes(targetDraft)
    if (!times) return

    const validation = validateReservationTime(times.start.toISOString(), times.end.toISOString())
    if (!validation.isValid) {
      toast.error('予約時間が無効です', { description: validation.error || '予約時間が無効です。' })
      return
    }

    try {
      setIsSending(true)
      const response = await apiClient.createExternalReservation({
        external_studio_id: targetDraft.externalId,
        group_id: targetDraft.groupId,
        start_time: times.start.toISOString(),
        end_time: times.end.toISOString(),
        admin: isAdminMode || undefined,
        acknowledged_member_conflicts: acknowledged || undefined,
      })

      if (response.success) {
        showSuccessToast({ message: '外部予約を送信しました' })
        setIsReservationFormOpen(false)
        setIsConflictDialogOpen(false)
        setConflicts([])
        setPendingDraft(null)
        setDraft({
          date: startOfDay(new Date()),
          externalId: null,
          groupId: null,
          startHour: null,
          startMinute: null,
          endHour: null,
          endMinute: null,
        })
        await fetchData()
        return
      }

      if (response.error === 'MEMBER_RESERVATION_CONFLICT_WARNING' && response.data) {
        setConflicts(response.data)
        setPendingDraft(targetDraft)
        setIsConflictDialogOpen(true)
        return
      }

      toast.error('外部予約の作成中にエラーが発生しました', {
        description: translateError(response.error || 'UNKNOWN_ERROR'),
      })
    } catch (error) {
      toast.error('外部予約の作成中にエラーが発生しました', {
        description: translateError((error as Error).message),
      })
    } finally {
      setIsSending(false)
    }
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    await submitReservation(draft, false)
  }

  const handleCancelReservation = async (id: string) => {
    try {
      setIsSending(true)
      const response = await apiClient.cancelExternalReservation(id, isAdminMode)
      if (response.success) {
        showSuccessToast({ message: '外部予約をキャンセルしました' })
        setIsDetailOpen(false)
        setSelectedReservation(null)
        await fetchData()
      } else {
        toast.error('外部予約のキャンセル中にエラーが発生しました', {
          description: translateError(response.error || 'UNKNOWN_ERROR'),
        })
      }
    } finally {
      setIsSending(false)
    }
  }

  const handleCreateExternals = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!externalStartDate || !externalEndDate) return

    const start = new Date(externalStartDate)
    const [startHour, startMinute] = externalStartTime.split(':').map(Number)
    start.setHours(startHour, startMinute, 0, 0)

    const end = new Date(externalEndDate)
    const [endHour, endMinute] = externalEndTime.split(':').map(Number)
    end.setHours(endHour, endMinute, 0, 0)

    const names = externalNames.map((name) => name.trim()).filter(Boolean)
    if (names.length === 0) {
      toast.error('外部スタジオ名を入力してください')
      return
    }

    try {
      setIsCreatingExternal(true)
      const response = await apiClient.createExternals({
        names,
        start_datetime: start.toISOString(),
        end_datetime: end.toISOString(),
      })
      if (response.success) {
        showSuccessToast({ message: '外部スタジオを追加しました' })
        setExternalNames([''])
        await fetchData()
      } else {
        toast.error('外部スタジオの追加中にエラーが発生しました', {
          description: translateError(response.error || 'UNKNOWN_ERROR'),
        })
      }
    } finally {
      setIsCreatingExternal(false)
    }
  }

  const handleDeleteExternal = async (id: string) => {
    try {
      setDeletingExternalId(id)
      const response = await apiClient.deleteExternal(id)
      if (response.success) {
        showSuccessToast({ message: '外部スタジオを削除しました' })
        await fetchData()
      } else {
        toast.error('外部スタジオの削除中にエラーが発生しました', {
          description: translateError(response.error || 'UNKNOWN_ERROR'),
        })
      }
    } finally {
      setDeletingExternalId(null)
    }
  }

  const isReservationButtonDisabled = isSending ||
    !draft.externalId ||
    !draft.groupId ||
    draft.startHour === null ||
    draft.startMinute === null ||
    draft.endHour === null ||
    draft.endMinute === null

  if (authLoading || loading) {
    return (
      <>
        <ReservationPageHeader />
        <div className="p-5">
          <Skeleton className="h-[720px] w-full" />
        </div>
      </>
    )
  }

  return (
    <>
      <ReservationPageHeader
        onAddReservation={() => setIsReservationFormOpen(true)}
        onRefresh={fetchData}
        onAdminToggle={(checked) => {
          setIsAdminMode(checked)
          setMyGroups([])
        }}
        onManageExternal={() => setIsManageOpen(true)}
        isAdminMode={isAdminMode}
      />
      <div className="h-[calc(100vh-4rem)] flex flex-col">
        <div className="flex-1 mx-auto px-5 w-full max-w-none">
          <Card className="bg-white shadow-lg rounded-lg overflow-hidden h-full flex flex-col">
            <CardDescription className="flex-shrink-0">
              <div className="p-2 flex flex-wrap items-center justify-end gap-2">
                <Button variant="outline" onClick={() => setCurrentDate(subDays(currentDate, 1))}>
                  <ChevronLeftIcon className="h-4 w-4" />
                </Button>
                <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline">
                      {format(currentDate, 'yyyy年M月d日', { locale: jaLocale })}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="center">
                    <CalendarPrimitive
                      mode="single"
                      locale={jaLocale}
                      selected={currentDate}
                      onSelect={(date) => {
                        if (date) setCurrentDate(date)
                        setIsDatePickerOpen(false)
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <Button variant="outline" onClick={() => setCurrentDate(addDays(currentDate, 1))}>
                  <ChevronRightIcon className="h-4 w-4" />
                </Button>
              </div>
            </CardDescription>
            <CardContent className="flex-1">
              {resources.length === 0 ? (
                <div className="flex h-[720px] items-center justify-center rounded-md border text-sm text-gray-600">
                  この日に利用できる外部スタジオはありません
                </div>
              ) : (
                <BigCalendar<CalendarEvent, ExternalResource>
                  localizer={localizer}
                  events={calendarEvents}
                  resources={resources}
                  resourceIdAccessor="id"
                  resourceTitleAccessor="title"
                  resourceAccessor="resourceId"
                  titleAccessor={(event) => event.title}
                  startAccessor={(event) => event.start}
                  endAccessor={(event) => event.end}
                  allDayAccessor={(event) => event.allDay}
                  onSelectEvent={(event) => {
                    setSelectedReservation(event)
                    setIsDetailOpen(true)
                  }}
                  views={{ day: true }}
                  messages={messages}
                  culture="ja"
                  toolbar={false}
                  min={new Date(0, 0, 0, 6, 0, 0)}
                  max={new Date(0, 0, 0, 23, 0, 0)}
                  date={currentDate}
                  view={Views.DAY as View}
                  onView={() => undefined}
                  onNavigate={(date) => setCurrentDate(date)}
                  formats={{
                    dayHeaderFormat: (date) => format(date, 'yyyy年M月d日（eee）', { locale: jaLocale }),
                    eventTimeRangeFormat: (event) => `${format(event.start, 'H:mm', { locale: jaLocale })} 〜 ${format(event.end, 'H:mm', { locale: jaLocale })}`,
                  }}
                  eventPropGetter={(event) => ({
                    style: {
                      backgroundColor: event.meta.state === ReservationState.CONFIRMED ? '#C8E6CD' : event.meta.state === ReservationState.PENDING ? '#FFE599' : '#D5D8DC',
                      color: 'black',
                      border: `2px solid ${event.meta.state === ReservationState.CONFIRMED ? '#2ECC71' : event.meta.state === ReservationState.PENDING ? '#F1C40F' : '#BDC3C7'}`,
                    },
                  })}
                />
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={isDetailOpen && selectedReservation !== null} onOpenChange={(open) => {
        setIsDetailOpen(open)
        if (!open) setSelectedReservation(null)
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>外部予約詳細</DialogTitle>
          </DialogHeader>
          {selectedReservation && (
            <div className="space-y-4">
              <div className="space-y-2">
                <p><strong>場所</strong> {selectedReservation.meta.externalName}</p>
                <p><strong>時間</strong> {format(selectedReservation.start, 'M月d日 H:mm', { locale: jaLocale })} 〜 {format(selectedReservation.end, 'H:mm', { locale: jaLocale })}</p>
                {selectedReservation.meta.groupName && <p><strong>グループ</strong> {selectedReservation.meta.groupName}</p>}
                {selectedReservation.meta.userName && <p><strong>予約者</strong> {selectedReservation.meta.userName}</p>}
                <p><strong>ステータス</strong> {eventStateNames[selectedReservation.meta.state]}</p>
              </div>
              {selectedReservation.meta.cancellable === 1 && (
                <LoadingButton
                  variant="destructive"
                  className="w-full"
                  isLoading={isSending}
                  onClick={() => handleCancelReservation(selectedReservation.meta.reservationId)}
                >
                  キャンセル
                </LoadingButton>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isReservationFormOpen} onOpenChange={setIsReservationFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新規外部予約</DialogTitle>
            <DialogDescription>外部スタジオ予約は団体名義のみ作成できます。</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>予約名義</Label>
              <Select
                value={draft.groupId || ''}
                onValueChange={(value) => handleInputChange('groupId', value)}
                onOpenChange={(open) => {
                  if (open && myGroups.length === 0) void fetchGroups()
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="団体を選択" />
                </SelectTrigger>
                <SelectContent className="max-h-[220px]">
                  {isGroupsLoading ? (
                    <div className="flex items-center justify-center p-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="ml-2 text-sm text-gray-500">読み込み中...</span>
                    </div>
                  ) : (
                    myGroups.map((group) => (
                      <SelectItem key={group.id} value={group.id}>
                        <div className="flex items-center justify-between gap-2">
                          <span>{group.name}</span>
                          <Badge variant={group.is_main ? 'default' : 'outline'}>{group.is_main ? '本バンド' : '自由バンド'}</Badge>
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>予約日</Label>
              <Popover modal={true}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(draft.date, 'yyyy年M月d日', { locale: jaLocale })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarPrimitive
                    mode="single"
                    selected={draft.date}
                    onSelect={(date) => {
                      if (date) handleInputChange('date', date)
                    }}
                    initialFocus
                    locale={jaLocale}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div>
              <Label>外部スタジオ</Label>
              <Select value={draft.externalId || ''} onValueChange={(value) => handleInputChange('externalId', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="外部スタジオを選択" />
                </SelectTrigger>
                <SelectContent className="max-h-[220px]">
                  {selectableExternals.map((external) => (
                    <SelectItem key={external.id} value={external.id}>
                      {external.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>開始時刻（時）</Label>
                <Select value={draft.startHour !== null ? String(draft.startHour) : ''} onValueChange={(value) => handleInputChange('startHour', Number(value))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{generateHourOptions(6, 17).map((hour) => <SelectItem key={hour} value={String(hour)}>{String(hour).padStart(2, '0')}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>開始時刻（分）</Label>
                <Select disabled={draft.startHour === null} value={draft.startMinute !== null ? String(draft.startMinute) : ''} onValueChange={(value) => handleInputChange('startMinute', Number(value))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{generateMinuteOptions().map((minute) => <SelectItem key={minute} value={String(minute)}>{String(minute).padStart(2, '0')}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>終了時刻（時）</Label>
                <Select disabled={draft.startMinute === null} value={draft.endHour !== null ? String(draft.endHour) : ''} onValueChange={(value) => handleInputChange('endHour', Number(value))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{generateHourOptions(6, 18).map((hour) => <SelectItem key={hour} value={String(hour)}>{String(hour).padStart(2, '0')}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>終了時刻（分）</Label>
                <Select disabled={draft.endHour === null} value={draft.endMinute !== null ? String(draft.endMinute) : ''} onValueChange={(value) => handleInputChange('endMinute', Number(value))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{generateMinuteOptions().map((minute) => <SelectItem key={minute} value={String(minute)}>{String(minute).padStart(2, '0')}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            <LoadingButton type="submit" isLoading={isSending} disabled={isReservationButtonDisabled} className={cn('w-full', isReservationButtonDisabled && 'opacity-50')}>
              予約
            </LoadingButton>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isConflictDialogOpen} onOpenChange={setIsConflictDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>同時間帯の予約があります</DialogTitle>
            <DialogDescription>以下のメンバーは同じ時間帯に別の予約へ参加しています。確認して予約を続行できます。</DialogDescription>
          </DialogHeader>
          <div className="max-h-[320px] space-y-2 overflow-y-auto">
            {conflicts.map((conflict) => (
              <div key={`${conflict.member_id}-${conflict.reservation_type}-${conflict.reservation_id}`} className="rounded-md border p-3 text-sm">
                <div className="font-medium">{conflict.member_name}</div>
                <div className="text-gray-700">{conflict.location_name} / {conflict.reservation_name}</div>
                <div className="text-gray-600">{format(new Date(conflict.start_time), 'M月d日 H:mm', { locale: jaLocale })} 〜 {format(new Date(conflict.end_time), 'H:mm', { locale: jaLocale })}</div>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsConflictDialogOpen(false)}>戻る</Button>
            <LoadingButton isLoading={isSending} onClick={() => pendingDraft && submitReservation(pendingDraft, true)}>
              承認して予約
            </LoadingButton>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isManageOpen} onOpenChange={setIsManageOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>外部スタジオ管理</DialogTitle>
            <DialogDescription>複数の外部スタジオを同じ期間で一括作成します。</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateExternals} className="space-y-4">
            <div className="space-y-2">
              <Label>外部スタジオ名</Label>
              <div className="space-y-2">
                {externalNames.map((name, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      value={name}
                      onChange={(event) => {
                        const nextNames = [...externalNames]
                        nextNames[index] = event.target.value
                        setExternalNames(nextNames)
                      }}
                      placeholder={`外部スタジオ ${index + 1}`}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      disabled={externalNames.length === 1}
                      onClick={() => setExternalNames(externalNames.filter((_, itemIndex) => itemIndex !== index))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setExternalNames([...externalNames, ''])}
              >
                <Plus className="h-4 w-4" />
                追加
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>開始日</Label>
                <Input type="date" value={externalStartDate ? format(externalStartDate, 'yyyy-MM-dd') : ''} onChange={(event) => setExternalStartDate(event.target.value ? new Date(event.target.value) : undefined)} />
              </div>
              <div className="space-y-2">
                <Label>開始時刻</Label>
                <Input type="time" value={externalStartTime} onChange={(event) => setExternalStartTime(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>終了日</Label>
                <Input type="date" value={externalEndDate ? format(externalEndDate, 'yyyy-MM-dd') : ''} onChange={(event) => setExternalEndDate(event.target.value ? new Date(event.target.value) : undefined)} />
              </div>
              <div className="space-y-2">
                <Label>終了時刻</Label>
                <Input type="time" value={externalEndTime} onChange={(event) => setExternalEndTime(event.target.value)} />
              </div>
            </div>
            <div className="flex justify-end">
              <LoadingButton type="submit" isLoading={isCreatingExternal}>
                作成
              </LoadingButton>
            </div>
          </form>
          <div className="max-h-[260px] space-y-2 overflow-y-auto">
            {externals.map((external) => (
              <div key={external.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
                <div className="min-w-0">
                  <div className="font-medium">{external.name}</div>
                  <div className="text-xs text-gray-600">
                    {format(new Date(external.start_datetime), 'M月d日 H:mm', { locale: jaLocale })} 〜 {format(new Date(external.end_datetime), 'M月d日 H:mm', { locale: jaLocale })}
                  </div>
                </div>
                <Button variant="destructive" size="sm" disabled={deletingExternalId === external.id} onClick={() => handleDeleteExternal(external.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
