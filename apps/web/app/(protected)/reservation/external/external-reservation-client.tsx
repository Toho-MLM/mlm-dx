'use client'

import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { Calendar as BigCalendar, dateFnsLocalizer, Views, type View } from 'react-big-calendar'
import { format, getDay, parse, startOfWeek } from 'date-fns'
import { ja as jaLocale } from 'date-fns/locale'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import { AlertCircle, ChevronLeftIcon, ChevronRightIcon, Loader2, Trash2 } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { ReservationPageHeader } from '@/components/reservation-page-header'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LoadingButton } from '@/components/ui/loading-button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Card, CardContent, CardDescription } from '@/components/ui/card'
import { cn, showSuccessToast } from '@/lib/utils'
import { translateError } from '@/lib/error-label'
import { apiClient } from '@/lib/api'
import { getLoginPath } from '@/lib/auth-redirect'
import { useAuth } from '@/app/context/AuthContext'
import { eventStateNames, ReservationState } from '@/app/types'
import { isAdmin, isExternalLotteryReservationProtected, validateExternalReservationTime, type External, type ExternalReservation, type ExternalReservationConflict } from '@shared-schemas'
import { useAdminMode } from '@/hooks/use-admin-mode'
import { ReservationEditDialog } from '@/components/reservation-edit-dialog'
import { toJSTWallClockDate } from '../reservation-calendar'

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
  startDateTime: string
  endDateTime: string
  externalId: string | null
  roomNumber: number | null
  groupId: string | null
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
    cancellable: boolean
    startTime: string
    endTime: string
  }
}

type CalendarSegment = {
  date: Date
  dateKey: string
  min: Date
  max: Date
  height: number
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

const getJSTDateString = (value: Date | string) => new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date(value))

const toJSTLocalInputValue = (value: Date | string) => {
  const date = new Date(value)
  return new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 16)
}

const addJSTDays = (dateString: string, days: number) => {
  const date = new Date(`${dateString}T00:00:00+09:00`)
  date.setUTCDate(date.getUTCDate() + days)
  return getJSTDateString(date)
}

const getInitialExternalDraft = (external: External | null = null): ExternalDraft => {
  return {
    startDateTime: '',
    endDateTime: '',
    externalId: external?.id || null,
    roomNumber: null,
    groupId: null,
  }
}

const getJSTTimeParts = (value: Date) => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value)
  const getPart = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value || 0)
  return {
    hour: getPart('hour'),
    minute: getPart('minute'),
    second: getPart('second'),
  }
}

const toCalendarTime = (value: Date) => {
  const { hour, minute, second } = getJSTTimeParts(value)
  return new Date(0, 0, 0, hour, minute, second)
}

const getExternalLabel = (external: External) => (
  `${format(toJSTWallClockDate(external.start_datetime), 'M月d日 H:mm', { locale: jaLocale })} 〜 ${format(toJSTWallClockDate(external.end_datetime), 'M月d日 H:mm', { locale: jaLocale })}（${external.room_names.length}部屋）`
)

const getCalendarSegments = (external: External): CalendarSegment[] => {
  const externalStart = new Date(external.start_datetime)
  const externalEnd = new Date(external.end_datetime)
  if (externalEnd <= externalStart) return []

  const segments: CalendarSegment[] = []
  let dateKey = getJSTDateString(externalStart)
  const lastDateKey = getJSTDateString(new Date(externalEnd.getTime() - 1))

  while (dateKey <= lastDateKey) {
    const nextDateKey = addJSTDays(dateKey, 1)
    const dayStart = new Date(`${dateKey}T00:00:00+09:00`)
    const dayEnd = new Date(`${nextDateKey}T00:00:00+09:00`)
    const segmentStart = externalStart > dayStart ? externalStart : dayStart
    const segmentEnd = externalEnd < dayEnd ? externalEnd : dayEnd
    const durationHours = (segmentEnd.getTime() - segmentStart.getTime()) / 3_600_000

    segments.push({
      date: new Date(`${dateKey}T12:00:00`),
      dateKey,
      min: toCalendarTime(segmentStart),
      max: segmentEnd >= dayEnd ? new Date(0, 0, 0, 23, 59, 59) : toCalendarTime(segmentEnd),
      height: Math.max(360, Math.min(960, Math.ceil(durationHours * 48))),
    })
    dateKey = nextDateKey
  }

  return segments
}

export type ExternalReservationInitialData = {
  externals: External[] | null
  reservations: ExternalReservation[] | null
}

export function ExternalReservationClient({ initialData, initialAdminMode = false }: { initialData?: ExternalReservationInitialData; initialAdminMode?: boolean }) {
  return (
    <Suspense fallback={null}>
      <ExternalReservationContent initialData={initialData} initialAdminMode={initialAdminMode} />
    </Suspense>
  )
}

function ExternalReservationContent({ initialData, initialAdminMode }: { initialData?: ExternalReservationInitialData; initialAdminMode: boolean }) {
  const hasCompleteInitialData = initialData !== undefined
    && initialData.externals !== null
    && initialData.reservations !== null
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { user, loading: authLoading } = useAuth()
  const [isAdminMode] = useAdminMode(user && isAdmin(user.role), initialAdminMode)
  const [loading, setLoading] = useState(!hasCompleteInitialData)
  const [loadError, setLoadError] = useState<string | null>(initialData?.externals === null || initialData?.reservations === null ? '外部予約を読み込めませんでした。' : null)
  const [externals, setExternals] = useState<External[]>(
    (initialData?.externals ?? []).filter((external) => external.target_type === 'EXTERNAL')
  )
  const [selectedExternalId, setSelectedExternalId] = useState<string | null>(() => {
    const initialExternals = (initialData?.externals ?? []).filter((external) => external.target_type === 'EXTERNAL')
    const now = new Date()
    return initialExternals.find((external) => new Date(external.start_datetime) <= now && new Date(external.end_datetime) > now)?.id
      || initialExternals.find((external) => new Date(external.end_datetime) > now)?.id
      || initialExternals.at(-1)?.id
      || null
  })
  const [reservations, setReservations] = useState<ExternalReservation[]>(initialData?.reservations ?? [])
  const [myGroups, setMyGroups] = useState<GroupOption[]>([])
  const [isGroupsLoading, setIsGroupsLoading] = useState(false)
  const [isReservationFormOpen, setIsReservationFormOpen] = useState(false)
  const [selectedReservation, setSelectedReservation] = useState<CalendarEvent | null>(null)
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isStatusUpdating, setIsStatusUpdating] = useState(false)
  const [selectedStatus, setSelectedStatus] = useState<ReservationState>(ReservationState.PENDING)
  const [isSending, setIsSending] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isDeleteConfirming, setIsDeleteConfirming] = useState(false)
  const [conflicts, setConflicts] = useState<ExternalReservationConflict[]>([])
  const [pendingDraft, setPendingDraft] = useState<ExternalDraft | null>(null)
  const [pendingEdit, setPendingEdit] = useState<{ startTime: string; endTime: string } | null>(null)
  const [isConflictDialogOpen, setIsConflictDialogOpen] = useState(false)
  const [draft, setDraft] = useState<ExternalDraft>(() => getInitialExternalDraft())

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
    setLoadError(null)
    try {
      const [externalsResponse, reservationsResponse] = await Promise.all([
        apiClient.getExternals(),
        apiClient.getExternalReservations(isAdminMode),
      ])
      if (!externalsResponse.success || !externalsResponse.data) {
        throw new Error(externalsResponse.error || 'EXTERNAL_FETCH_FAILED')
      }
      if (!reservationsResponse.success || !reservationsResponse.data) {
        throw new Error(reservationsResponse.error || 'EXTERNAL_RESERVATION_FETCH_FAILED')
      }

      const externalTargets = externalsResponse.data.filter((external) => external.target_type === 'EXTERNAL')
      setExternals(externalTargets)
      setSelectedExternalId((currentId) => {
        if (currentId && externalTargets.some((external) => external.id === currentId)) return currentId
        const now = new Date()
        return externalTargets.find((external) => (
          new Date(external.start_datetime) <= now && new Date(external.end_datetime) > now
        ))?.id || externalTargets.find((external) => new Date(external.end_datetime) > now)?.id || externalTargets.at(-1)?.id || null
      })
      setReservations(reservationsResponse.data)
    } catch (error) {
      console.error('Failed to fetch external reservations:', error)
      setLoadError(translateError((error as Error).message))
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

      if (hasCompleteInitialData && isAdminMode === initialAdminMode) return

      try {
        await fetchData()
      } finally {
        setLoading(false)
      }
    }

    void init()
  }, [authLoading, fetchData, router, user, pathname, searchParams, hasCompleteInitialData, initialAdminMode, isAdminMode])

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

  const sortedExternals = useMemo(() => (
    [...externals].sort((left, right) => (
      new Date(left.start_datetime).getTime() - new Date(right.start_datetime).getTime()
    ))
  ), [externals])

  const selectedExternalIndex = sortedExternals.findIndex((external) => external.id === selectedExternalId)
  const selectedExternal = selectedExternalIndex >= 0 ? sortedExternals[selectedExternalIndex] : null

  const resources: ExternalResource[] = useMemo(() => (
    selectedExternal?.room_names.map((roomName, index) => ({
      id: `${selectedExternal.id}:${index + 1}`,
      title: roomName,
    })) || []
  ), [selectedExternal])

  const calendarEvents: CalendarEvent[] = useMemo(() => (
    reservations.map((reservation) => ({
      id: reservation.id,
      title: reservation.group_name || reservation.user_name || '個人練',
      start: toJSTWallClockDate(reservation.start_time),
      end: toJSTWallClockDate(reservation.end_time),
      resourceId: `${reservation.external_studio_id}:${reservation.room_number}`,
      allDay: false,
      meta: {
        reservationId: reservation.id,
        externalName: reservation.room_name || `部屋 ${reservation.room_number}`,
        userName: reservation.user_name || undefined,
        groupName: reservation.group_name || undefined,
        state: reservation.state as ReservationState,
        cancellable: reservation.cancellable,
        startTime: reservation.start_time,
        endTime: reservation.end_time,
      },
    }))
  ), [reservations])

  const selectedCalendarEvents = useMemo(() => (
    selectedExternal ? calendarEvents.filter((event) => event.resourceId.startsWith(`${selectedExternal.id}:`)) : []
  ), [calendarEvents, selectedExternal])

  const calendarSegments = useMemo(() => (
    selectedExternal ? getCalendarSegments(selectedExternal) : []
  ), [selectedExternal])

  const reservableExternals = useMemo(() => (
    sortedExternals.filter((external) => new Date(external.end_datetime) > new Date())
  ), [sortedExternals])

  const draftExternal = externals.find((external) => external.id === draft.externalId) || null
  const draftMinDateTime = draftExternal ? toJSTLocalInputValue(draftExternal.start_datetime) : undefined
  const draftMaxStartDateTime = draftExternal
    ? toJSTLocalInputValue(new Date(new Date(draftExternal.end_datetime).getTime() - 10 * 60_000))
    : undefined
  const draftMaxEndDateTime = draftExternal ? toJSTLocalInputValue(draftExternal.end_datetime) : undefined

  const handleInputChange = (name: keyof ExternalDraft, value: number | string | null) => {
    setDraft((prev) => {
      if (name === 'externalId') {
        const external = externals.find((item) => item.id === value) || null
        return {
          ...getInitialExternalDraft(external),
          groupId: prev.groupId,
        }
      }
      const next = { ...prev, [name]: value }
      if (name === 'startDateTime' && typeof value === 'string' && next.endDateTime <= value) {
        next.endDateTime = ''
      }
      return next
    })
  }

  const getDraftTimes = (targetDraft: ExternalDraft) => {
    if (!targetDraft.startDateTime || !targetDraft.endDateTime) return null

    const start = new Date(`${targetDraft.startDateTime}:00+09:00`)
    const end = new Date(`${targetDraft.endDateTime}:00+09:00`)
    return { start, end }
  }

  const submitReservation = async (targetDraft: ExternalDraft, acknowledged: boolean) => {
    if (!targetDraft.externalId || !targetDraft.roomNumber || !targetDraft.groupId) return
    const times = getDraftTimes(targetDraft)
    if (!times) return

    const validation = validateExternalReservationTime(times.start.toISOString(), times.end.toISOString())
    if (!validation.isValid) {
      toast.error('予約時間が無効です', { description: validation.error || '予約時間が無効です。' })
      return
    }
    const external = externals.find((item) => item.id === targetDraft.externalId)
    if (!external || times.start < new Date(external.start_datetime) || times.end > new Date(external.end_datetime)) {
      toast.error('予約時間が無効です', { description: '外部スタジオの時間枠内で指定してください。' })
      return
    }
    if (!isAdminMode && isExternalLotteryReservationProtected(times.start, times.end)) {
      toast.error('外部予約できません', { description: translateError('EXTERNAL_LOTTERY_PERIOD_PROTECTED') })
      return
    }

    try {
      setIsSending(true)
      const response = await apiClient.createExternalReservation({
        external_studio_id: targetDraft.externalId,
        room_number: targetDraft.roomNumber,
        group_id: targetDraft.groupId === '__personal__' ? null : targetDraft.groupId,
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
        setDraft(getInitialExternalDraft())
        await fetchData()
        return
      }

      if (response.error === 'MEMBER_RESERVATION_CONFLICT_WARNING' && response.data) {
        setConflicts(response.data)
        setPendingDraft(targetDraft)
        setPendingEdit(null)
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

  const handleDeleteReservation = async (id: string) => {
    try {
      setIsDeleting(true)
      const response = await apiClient.deleteExternalReservation(id)
      if (response.success) {
        setIsDetailOpen(false)
        setSelectedReservation(null)
        setIsDeleteConfirming(false)
        await fetchData()
        showSuccessToast({ message: '外部予約を完全に削除しました' })
      } else {
        toast.error('外部予約の削除中にエラーが発生しました', {
          description: translateError(response.error || 'UNKNOWN_ERROR'),
        })
      }
    } catch (error) {
      toast.error('外部予約の削除中にエラーが発生しました', {
        description: translateError((error as Error).message),
      })
    } finally {
      setIsDeleting(false)
    }
  }

  const updateExternalReservation = async (
    startTime: string,
    endTime: string,
    acknowledged: boolean
  ) => {
    if (!selectedReservation) return
    if (!isAdminMode && isExternalLotteryReservationProtected(startTime, endTime)) {
      toast.error('外部予約を変更できません', { description: translateError('EXTERNAL_LOTTERY_PERIOD_PROTECTED') })
      return
    }
    try {
      setIsSending(true)
      const response = await apiClient.updateExternalReservation(
        selectedReservation.meta.reservationId,
        {
          start_time: startTime,
          end_time: endTime,
          admin: isAdminMode || undefined,
          acknowledged_member_conflicts: acknowledged || undefined,
        }
      )
      if (response.success) {
        showSuccessToast({ message: '外部予約を変更しました' })
        setIsEditOpen(false)
        setIsConflictDialogOpen(false)
        setIsDetailOpen(false)
        setSelectedReservation(null)
        setPendingEdit(null)
        setConflicts([])
        await fetchData()
        return
      }
      if (response.error === 'MEMBER_RESERVATION_CONFLICT_WARNING' && response.data) {
        setConflicts(response.data)
        setPendingDraft(null)
        setPendingEdit({ startTime, endTime })
        setIsConflictDialogOpen(true)
        return
      }
      toast.error('外部予約の変更中にエラーが発生しました', {
        description: translateError(response.error || 'UNKNOWN_ERROR'),
      })
    } catch (error) {
      toast.error('外部予約の変更中にエラーが発生しました', {
        description: translateError((error as Error).message),
      })
    } finally {
      setIsSending(false)
    }
  }

  const handleUpdateExternalStatus = async () => {
    if (!selectedReservation) return
    try {
      setIsStatusUpdating(true)
      const response = await apiClient.updateExternalReservationStatus(
        selectedReservation.meta.reservationId,
        { state: selectedStatus }
      )
      if (!response.success) {
        toast.error('ステータスの変更中にエラーが発生しました', {
          description: translateError(response.error || 'UNKNOWN_ERROR'),
        })
        return
      }
      showSuccessToast({ message: 'ステータスを変更しました' })
      setIsDetailOpen(false)
      setSelectedReservation(null)
      await fetchData()
    } catch (error) {
      toast.error('ステータスの変更中にエラーが発生しました', {
        description: translateError((error as Error).message),
      })
    } finally {
      setIsStatusUpdating(false)
    }
  }

  const currentDraftTimes = getDraftTimes(draft)
  const isDraftInLotteryPeriod = Boolean(
    !isAdminMode &&
    currentDraftTimes &&
    isExternalLotteryReservationProtected(currentDraftTimes.start, currentDraftTimes.end)
  )
  const isReservationButtonDisabled = isSending ||
    isDraftInLotteryPeriod ||
    !draft.externalId ||
    !draft.roomNumber ||
    !draft.groupId ||
    !draft.startDateTime ||
    !draft.endDateTime

  const selectedReservationExternal = selectedReservation
    ? externals.find((external) => selectedReservation.resourceId.startsWith(`${external.id}:`)) || null
    : null

  const defaultReservationExternal = selectedExternal && new Date(selectedExternal.end_datetime) > new Date()
    ? selectedExternal
    : reservableExternals[0] || null

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
        onAddReservation={loadError ? undefined : () => {
          setDraft((current) => ({
            ...getInitialExternalDraft(defaultReservationExternal),
            groupId: current.groupId,
          }))
          setIsReservationFormOpen(true)
        }}
        onRefresh={fetchData}
      />
      <div className="mx-auto w-full max-w-none px-5 pb-5">
        <Card className="overflow-hidden rounded-lg bg-white shadow-lg">
          <CardDescription>
            <div className="flex flex-wrap items-center justify-center gap-2 p-2 md:justify-end">
              <Button
                type="button"
                variant="outline"
                disabled={selectedExternalIndex <= 0}
                onClick={() => setSelectedExternalId(sortedExternals[selectedExternalIndex - 1]?.id || null)}
                aria-label="前の外部スタジオ"
              >
                <ChevronLeftIcon className="h-4 w-4" />
              </Button>
              <Select value={selectedExternalId || ''} onValueChange={setSelectedExternalId} disabled={sortedExternals.length === 0}>
                <SelectTrigger className="w-[calc(100%-7rem)] sm:w-96">
                  <SelectValue placeholder="外部スタジオを選択" />
                </SelectTrigger>
                <SelectContent className="max-h-[320px]">
                  {sortedExternals.map((external) => (
                    <SelectItem key={external.id} value={external.id}>
                      {getExternalLabel(external)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                disabled={selectedExternalIndex < 0 || selectedExternalIndex >= sortedExternals.length - 1}
                onClick={() => setSelectedExternalId(sortedExternals[selectedExternalIndex + 1]?.id || null)}
                aria-label="次の外部スタジオ"
              >
                <ChevronRightIcon className="h-4 w-4" />
              </Button>
            </div>
          </CardDescription>
          <CardContent className="space-y-6">
            {loadError ? (
              <div className="flex h-72 flex-col items-center justify-center gap-3 rounded-md border text-center text-sm text-gray-600">
                <p>外部予約を読み込めませんでした</p>
                <p className="text-xs text-muted-foreground">{loadError}</p>
                <Button type="button" variant="outline" onClick={() => void fetchData()}>再試行</Button>
              </div>
            ) : !selectedExternal ? (
              <div className="flex h-72 items-center justify-center rounded-md border text-sm text-gray-600">
                利用できる外部スタジオはありません
              </div>
            ) : (
              calendarSegments.map((segment) => (
                <section key={segment.dateKey} className="space-y-2">
                  <h2 className="text-sm font-medium">
                    {format(segment.date, 'yyyy年M月d日（eee）', { locale: jaLocale })}
                  </h2>
                  <div className="external-reservation-calendar" style={{ height: segment.height }}>
                    <BigCalendar<CalendarEvent, ExternalResource>
                      localizer={localizer}
                      events={selectedCalendarEvents}
                      resources={resources}
                      resourceIdAccessor="id"
                      resourceTitleAccessor="title"
                      resourceAccessor="resourceId"
                      titleAccessor={(event) => event.title}
                      startAccessor={(event) => event.start}
                      endAccessor={(event) => event.end}
                      allDayAccessor={(event) => event.allDay}
                      onSelectEvent={(event) => {
                        setIsDeleteConfirming(false)
                        setSelectedReservation(event)
                        setSelectedStatus(event.meta.state)
                        setIsDetailOpen(true)
                      }}
                      views={{ day: true }}
                      messages={messages}
                      culture="ja"
                      toolbar={false}
                      min={segment.min}
                      max={segment.max}
                      scrollToTime={segment.min}
                      showMultiDayTimes
                      date={segment.date}
                      view={Views.DAY as View}
                      onView={() => undefined}
                      onNavigate={() => undefined}
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
                  </div>
                </section>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={isDetailOpen && selectedReservation !== null} onOpenChange={(open) => {
        setIsDetailOpen(open)
        if (!open) {
          setIsEditOpen(false)
          setIsDeleteConfirming(false)
          setSelectedReservation(null)
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>外部予約詳細</DialogTitle>
          </DialogHeader>
          {selectedReservation && (
            <div className="space-y-4">
              <div className="space-y-2">
                <p><strong>場所</strong> {selectedReservation.meta.externalName}</p>
                <p>
                  <strong>時間</strong> {format(selectedReservation.start, 'M月d日 H:mm', { locale: jaLocale })} 〜 {format(
                    selectedReservation.end,
                    format(selectedReservation.start, 'yyyy-MM-dd') === format(selectedReservation.end, 'yyyy-MM-dd') ? 'H:mm' : 'M月d日 H:mm',
                    { locale: jaLocale }
                  )}
                </p>
                {selectedReservation.meta.groupName && <p><strong>グループ</strong> {selectedReservation.meta.groupName}</p>}
                {selectedReservation.meta.userName && <p><strong>予約者</strong> {selectedReservation.meta.userName}</p>}
                <p><strong>ステータス</strong> {eventStateNames[selectedReservation.meta.state]}</p>
              </div>
              {selectedReservation.meta.cancellable && new Date(selectedReservation.meta.endTime) > new Date() && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={isSending || isDeleting || isDeleteConfirming}
                  onClick={() => setIsEditOpen(true)}
                >
                  変更
                </Button>
              )}
              {selectedReservation.meta.cancellable && (
                <LoadingButton
                  variant="destructive"
                  className="w-full"
                  isLoading={isSending}
                  disabled={isDeleting || isDeleteConfirming}
                  onClick={() => handleCancelReservation(selectedReservation.meta.reservationId)}
                >
                  キャンセル
                </LoadingButton>
              )}
              {isAdminMode && (
                <div className="space-y-3">
                  <div className="space-y-2 rounded-md border p-3">
                    <Label htmlFor="external-reservation-status">ステータス</Label>
                    <Select
                      value={selectedStatus}
                      onValueChange={(value) => setSelectedStatus(value as ReservationState)}
                    >
                      <SelectTrigger id="external-reservation-status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.values(ReservationState).map((state) => (
                          <SelectItem key={state} value={state}>
                            {eventStateNames[state]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <LoadingButton
                      type="button"
                      className="w-full"
                      isLoading={isStatusUpdating}
                      disabled={isDeleting || isDeleteConfirming}
                      onClick={handleUpdateExternalStatus}
                    >
                      ステータスを更新
                    </LoadingButton>
                  </div>
                  {!isDeleteConfirming && (
                    <Button
                      type="button"
                      variant="destructive"
                      className="w-full"
                      onClick={() => setIsDeleteConfirming(true)}
                      disabled={isSending || isDeleting || isStatusUpdating}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      完全に削除
                    </Button>
                  )}
                  {isDeleteConfirming && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>この外部予約を完全に削除しますか？</AlertTitle>
                      <AlertDescription className="mt-2 space-y-3">
                        <p>この予約はキャンセルや拒否として残らず、利用実績を含む予約情報が完全に削除されます。削除後は元に戻せません。</p>
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setIsDeleteConfirming(false)}
                            disabled={isDeleting}
                          >
                            戻る
                          </Button>
                          <LoadingButton
                            type="button"
                            variant="destructive"
                            size="sm"
                            onClick={() => void handleDeleteReservation(selectedReservation.meta.reservationId)}
                            isLoading={isDeleting}
                          >
                            DBから削除
                          </LoadingButton>
                        </div>
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {selectedReservation && (
        <ReservationEditDialog
          open={isEditOpen}
          onOpenChange={setIsEditOpen}
          start={new Date(selectedReservation.meta.startTime)}
          end={new Date(selectedReservation.meta.endTime)}
          isSaving={isSending}
          onSave={(startTime, endTime) => updateExternalReservation(startTime, endTime, false)}
          title="外部予約を変更"
          allowCrossDay
          rangeStart={selectedReservationExternal ? new Date(selectedReservationExternal.start_datetime) : undefined}
          rangeEnd={selectedReservationExternal ? new Date(selectedReservationExternal.end_datetime) : undefined}
        />
      )}

      <Dialog open={isReservationFormOpen} onOpenChange={setIsReservationFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新規外部予約</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="external-reservation-identity">予約名義</Label>
              <Select
                value={draft.groupId || ''}
                onValueChange={(value) => handleInputChange('groupId', value)}
                onOpenChange={(open) => {
                  if (open && myGroups.length === 0) void fetchGroups()
                }}
              >
                <SelectTrigger id="external-reservation-identity">
                  <SelectValue placeholder="団体を選択" />
                </SelectTrigger>
                <SelectContent className="max-h-[220px]">
                  {isGroupsLoading ? (
                    <div className="flex items-center justify-center p-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="ml-2 text-sm text-gray-500">読み込み中...</span>
                    </div>
                  ) : (
                    <>
                      <SelectItem value="__personal__">個人（{user?.nickname || user?.name}）</SelectItem>
                      {myGroups.map((group) => (
                        <SelectItem key={group.id} value={group.id}>
                        <div className="flex items-center justify-between gap-2">
                          <span>{group.name}</span>
                          <Badge variant={group.is_main ? 'default' : 'outline'}>{group.is_main ? '本バンド' : '自由バンド'}</Badge>
                        </div>
                        </SelectItem>
                      ))}
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="external-reservation-studio">時間枠</Label>
              <Select value={draft.externalId || ''} onValueChange={(value) => handleInputChange('externalId', value)}>
                <SelectTrigger id="external-reservation-studio">
                  <SelectValue placeholder="外部スタジオを選択" />
                </SelectTrigger>
                <SelectContent className="max-h-[220px]">
                  {reservableExternals.map((external) => (
                    <SelectItem key={external.id} value={external.id}>
                      {getExternalLabel(external)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="external-reservation-start-datetime">開始日時</Label>
                <Input
                  id="external-reservation-start-datetime"
                  type="datetime-local"
                  step={60}
                  value={draft.startDateTime}
                  min={draftMinDateTime}
                  max={draftMaxStartDateTime}
                  disabled={!draft.externalId}
                  onChange={(event) => handleInputChange('startDateTime', event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="external-reservation-end-datetime">終了日時</Label>
                <Input
                  id="external-reservation-end-datetime"
                  type="datetime-local"
                  step={60}
                  value={draft.endDateTime}
                  min={draft.startDateTime || draftMinDateTime}
                  max={draftMaxEndDateTime}
                  disabled={!draft.externalId}
                  onChange={(event) => handleInputChange('endDateTime', event.target.value)}
                  required
                />
              </div>
            </div>

            <div>
              <Label htmlFor="external-reservation-room">部屋</Label>
              <Select
                disabled={!draft.externalId}
                value={draft.roomNumber ? String(draft.roomNumber) : ''}
                onValueChange={(value) => handleInputChange('roomNumber', Number(value))}
              >
                <SelectTrigger id="external-reservation-room"><SelectValue placeholder="部屋を選択" /></SelectTrigger>
                <SelectContent>
                  {externals.find((external) => external.id === draft.externalId)?.room_names.map((name, index) => (
                    <SelectItem key={name} value={String(index + 1)}>{index + 1}. {name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isDraftInLotteryPeriod && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>抽選対象の期間です</AlertTitle>
                <AlertDescription>この期間は外部予約できません。抽選から申し込んでください。</AlertDescription>
              </Alert>
            )}

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
                <div><span className="font-medium">メンバー:</span> {conflict.member_name}</div>
                <div className="text-gray-700"><span className="font-medium">重複予約:</span> {conflict.location_name} / {conflict.reservation_name}</div>
                <div className="text-gray-600">
                  <span className="font-medium">時間:</span> {format(toJSTWallClockDate(conflict.start_time), 'M月d日 H:mm', { locale: jaLocale })} 〜 {format(
                    toJSTWallClockDate(conflict.end_time),
                    getJSTDateString(conflict.start_time) === getJSTDateString(conflict.end_time) ? 'H:mm' : 'M月d日 H:mm',
                    { locale: jaLocale }
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsConflictDialogOpen(false)}>戻る</Button>
            <LoadingButton
              isLoading={isSending}
              onClick={() => {
                if (pendingEdit) {
                  void updateExternalReservation(pendingEdit.startTime, pendingEdit.endTime, true)
                } else if (pendingDraft) {
                  void submitReservation(pendingDraft, true)
                }
              }}
            >
              {pendingEdit ? '変更' : '予約'}
            </LoadingButton>
          </div>
        </DialogContent>
      </Dialog>

    </>
  )
}
