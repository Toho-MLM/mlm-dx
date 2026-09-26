'use client'

import { ToastNotice } from '@/components/toast-notice'

import { HallLotteries } from '@/components/hall-lotteries'

import React, { Suspense, useState, useRef, useMemo, useEffect, useCallback } from 'react'
import { Calendar as BigCalendar, dateFnsLocalizer, Views, View, Navigate, DateLocalizer, type SlotInfo } from 'react-big-calendar'
import { Calendar as CalendarPrimitive } from "@/components/ui/calendar"
import { format, parse, startOfWeek, getDay, addDays, addMinutes, startOfDay, subDays } from 'date-fns'
import { ja as jaLocale } from 'date-fns/locale'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import { Card, CardContent, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { LoadingButton } from "@/components/ui/loading-button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ChevronLeftIcon, ChevronRightIcon, Loader2, CalendarRangeIcon } from 'lucide-react'
import { toast } from '@/lib/toast'
import { translateError } from '@/lib/error-label'
import {
  DialogFooter,
} from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn, showSuccessToast } from "@/lib/utils"
import { ReservationState, eventStateNames } from '../../types'
import { validateReservationTime, isReservationDateValid, isReservationTimeValid, isAdmin, type Reservation, type Event, type UnavailablePeriod, type ReservationLimit, type ReservationLimitRemaining } from '@shared-schemas'
import {
  adjustReservationDraftForDate,
  MIN_RESERVATION_MINUTES,
  toEventCalendarEvents,
  toReservationCalendarEvents,
  toUnavailableCalendarEvents,
  toJSTWallClockDate,
  type CalendarEvent,
  type ReservationDraft,
} from './reservation-calendar'
type GroupOption = {
  id: string;
  name: string;
  main_index: number | null;
}

const toJSTISOString = (date: Date, hour: number, minute: number) => {
  const dateKey = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-')
  return new Date(`${dateKey}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+09:00`).toISOString()
}

import { apiClient } from '@/lib/api'
import TimeGrid from 'react-big-calendar/lib/TimeGrid'
import { DropdownMenu, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useAuth } from '../../context/AuthContext'
import { ReservationPageHeader } from '@/components/reservation-page-header'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useAdminMode } from '@/hooks/use-admin-mode'
import { getLoginPath } from '@/lib/auth-redirect'
import { DraftDialog } from '@/components/draft-dialog'
import { ReservationDetailsDialog } from '@/components/reservation-details-dialog'
import { ReservationStatusSelect } from '@/components/reservation-status-select'


const locales = {
  'ja': jaLocale,
}

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
})

const messages = {
  week: '週',
  myRange: '3日',
  day: '日',
  previous: '前',
  next: '次',
  today: '今日',
  agenda: 'リスト',
  showMore: (total: number) => `+${total} 件`,
}

function ThreeDayView({
  date,
  localizer,
  ...props
}: {
  date: Date
  localizer: DateLocalizer
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: unknown
}) {
  const currRange = useMemo(
    () => ThreeDayView.range(date, { localizer }),
    [date, localizer]
  )

  return (
    <TimeGrid
      {...props}
      date={date}
      localizer={localizer}
      range={currRange}
      eventOffset={15}
    />
  )
}

ThreeDayView.range = (date: Date, { localizer }: { localizer: DateLocalizer }) => {
  const start = startOfDay(date)
  const end = addDays(start, 2)

  let current = start
  const range = []

  while (localizer.lte(current, end, 'day')) {
    range.push(current)
    current = addDays(current, 1)
  }

  return range
}

ThreeDayView.navigate = (date: Date, action: string) => {
  switch (action) {
    case Navigate.PREVIOUS:
      return addDays(date, -3)
    case Navigate.NEXT:
      return addDays(date, 3)
    default:
      return date
  }
}

ThreeDayView.title = (date: Date) => {
  const start = format(date, 'MM/dd', { locale: jaLocale })
  const end = format(addDays(date, 2), 'MM/dd', { locale: jaLocale })
  return `3日間表示: ${start} - ${end}`
}

export type ReservationInitialData = {
  reservations: Reservation[] | null
  events: Event[] | null
  unavailablePeriods: UnavailablePeriod[] | null
  reservationLimits: ReservationLimit[] | null
}

export function ReservationClient({ initialData, initialAdminMode = false }: { initialData?: ReservationInitialData; initialAdminMode?: boolean }) {
  return (
    <Suspense fallback={null}>
      <ReservationContent initialData={initialData} initialAdminMode={initialAdminMode} />
    </Suspense>
  )
}

function ReservationContent({ initialData, initialAdminMode }: { initialData?: ReservationInitialData; initialAdminMode: boolean }) {
  const hasCompleteInitialData = initialData !== undefined
    && initialData.reservations !== null
    && initialData.events !== null
    && initialData.unavailablePeriods !== null
    && initialData.reservationLimits !== null
  const [isMobile, setIsMobile] = useState(false)
  const [reservationDraft, setReservationDraft] = useState<ReservationDraft>({
    date: startOfDay(toJSTWallClockDate(new Date())),
    group: null as string | null,
    startHour: null as number | null,
    startMinute: null as number | null,
    endHour: null as number | null,
    endMinute: null as number | null,
  })
  const [isReservationFormOpen, setIsReservationFormOpen] = useState(false)
  const [selectedReservation, setSelectedReservation] = useState<CalendarEvent | null>(null)
  const [currentDate, setCurrentDate] = useState(toJSTWallClockDate(new Date()))
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isStatusUpdating, setIsStatusUpdating] = useState(false)
  const [currentView, setCurrentView] = useState<View>(Views.WEEK)
  const [isEventDetailOpen, setIsEventDetailOpen] = useState(false)
  const [reservationData, setReservationData] = useState<CalendarEvent[]>(initialData?.reservations ? toReservationCalendarEvents(initialData.reservations) : [])
  const [loading, setLoading] = useState(!hasCompleteInitialData)
  const [reservationError, setReservationError] = useState<string | null>(initialData?.reservations === null ? '予約情報を読み込めませんでした。' : null)
  const [myGroups, setMyGroups] = useState<GroupOption[]>([])
  const [isGroupsLoading, setIsGroupsLoading] = useState(false)
  const [events, setEvents] = useState<CalendarEvent[]>(initialData?.events ? toEventCalendarEvents(initialData.events) : [])
  const [unavailablePeriods, setUnavailablePeriods] = useState<CalendarEvent[]>(initialData?.unavailablePeriods ? toUnavailableCalendarEvents(initialData.unavailablePeriods) : [])
  const [reservationLimits, setReservationLimits] = useState<ReservationLimit[]>(initialData?.reservationLimits ?? [])
  const [reservationLimitRemaining, setReservationLimitRemaining] = useState<ReservationLimitRemaining[]>([])
  const [reservationLimitError, setReservationLimitError] = useState(false)
  const [reservationLimitLoading, setReservationLimitLoading] = useState(true)
  const reservationLimitRequestIdRef = useRef(0)
  const { user, loading: authLoading } = useAuth();
  const [isAdminMode] = useAdminMode(user && isAdmin(user.role), initialAdminMode);
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const fetchReservationLimitRemaining = useCallback(async () => {
    if (!user) return

    const scope = reservationDraft.group ? 'GROUP' : 'PERSONAL'
    const targetId = reservationDraft.group || user.id
    const referenceTime = toJSTISOString(reservationDraft.date, 0, 0)
    const requestId = ++reservationLimitRequestIdRef.current

    try {
      setReservationLimitLoading(true)
      setReservationLimitError(false)
      const response = await apiClient.getReservationLimitRemaining(scope, targetId, referenceTime)
      if (requestId !== reservationLimitRequestIdRef.current) return
      if (response.success && response.data) {
        setReservationLimitRemaining(response.data)
      } else {
        setReservationLimitRemaining([])
        setReservationLimitError(true)
      }
    } catch (err) {
      if (requestId !== reservationLimitRequestIdRef.current) return
      console.error('Failed to fetch reservation limit remaining:', err)
      setReservationLimitRemaining([])
      setReservationLimitError(true)
    } finally {
      if (requestId === reservationLimitRequestIdRef.current) {
        setReservationLimitLoading(false)
      }
    }
  }, [user, reservationDraft.group, reservationDraft.date])

  useEffect(() => {
    setSelectedReservation((current) => current?.resource.type === 'reservation'
      ? reservationData.find((event) => event.id === current.id) ?? current : current)
  }, [reservationData])

  const fetchReservations = useCallback(async () => {
    try {
      setReservationError(null)
      const [reservationsResponse, eventsResponse, unavailablePeriodsResponse, reservationLimitsResponse] = await Promise.all([
        apiClient.getReservations(isAdminMode),
        apiClient.getEvents(),
        apiClient.getUnavailablePeriods(),
        apiClient.getReservationLimits(),
      ])

      if (!reservationsResponse.success || !eventsResponse.success || !unavailablePeriodsResponse.success || !reservationLimitsResponse.success) {
        throw new Error('RESERVATION_FETCH_FAILED')
      }

      setReservationData(toReservationCalendarEvents(reservationsResponse.data || []))
      setEvents(toEventCalendarEvents(eventsResponse.data || []))
      setUnavailablePeriods(toUnavailableCalendarEvents(unavailablePeriodsResponse.data || []))
      setReservationLimits(reservationLimitsResponse.data || [])
    } catch (error) {
      console.error('Failed to fetch reservation data:', error)
      setReservationError('予約情報を読み込めませんでした。')
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
        await fetchReservations()
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [authLoading, user, router, pathname, searchParams, fetchReservations, hasCompleteInitialData, initialAdminMode, isAdminMode])

  useEffect(() => {
    const mobileQuery = window.matchMedia('(max-width: 767px), (pointer: coarse)')
    const checkMobile = () => {
      setIsMobile(mobileQuery.matches)
    }

    checkMobile()

    mobileQuery.addEventListener('change', checkMobile)
    return () => mobileQuery.removeEventListener('change', checkMobile)
  }, [])

  useEffect(() => {
    if (isMobile) {
      setCurrentView('myRange' as View)
    }
  }, [isMobile])

  useEffect(() => {
    fetchReservationLimitRemaining()
  }, [fetchReservationLimitRemaining])

  const calendarRef = useRef<HTMLDivElement>(null)

  const handleReservationDateSelect = (date: Date) => {
    setReservationDraft((prev) => adjustReservationDraftForDate(
      prev,
      date,
      unavailablePeriods,
      isAdminMode
    ))
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (
      reservationDraft.startHour === null ||
      reservationDraft.startMinute === null ||
      reservationDraft.endHour === null ||
      reservationDraft.endMinute === null
    ) {
      return
    }

    const startISOString = toJSTISOString(reservationDraft.date, reservationDraft.startHour, reservationDraft.startMinute)
    const endISOString = toJSTISOString(reservationDraft.date, reservationDraft.endHour, reservationDraft.endMinute)

    const validation = validateReservationTime(startISOString, endISOString);
    if (!validation.isValid) {
      toast.error('予約時間が無効です', {
        description: validation.error || '予約時間が無効です。'
      });
      return;
    }

    try {
      setIsSending(true)

      const isPersonalReservation = !reservationDraft.group || reservationDraft.group === 'none';

      const response = await apiClient.createReservation({
        group_id: !isPersonalReservation && reservationDraft.group ? reservationDraft.group : undefined,
        start_time: startISOString,
        end_time: endISOString,
        admin: isAdminMode || undefined,
      });

      if (response.success) {
        showSuccessToast({ message: '予約を送信しました' })

        setReservationDraft({
          date: startOfDay(toJSTWallClockDate(new Date())),
          group: null,
          startHour: null,
          startMinute: null,
          endHour: null,
          endMinute: null,
        })
        setIsReservationFormOpen(false)
        await fetchReservations()
      } else {
        toast.error('データの送信中にエラーが発生しました', {
          description: translateError(response.error || 'UNKNOWN_ERROR')
        })
      }
    } catch (err) {
      toast.error('予約の作成中にエラーが発生しました', {
        description: translateError((err as Error).message)
      })
    } finally {
      setIsSending(false);
    }
  }

  const handleCancel = async (id: string) => {
    setIsSending(true)
    try {
      const response = await apiClient.cancelReservation(id, isAdminMode);

      if (response.success) {
        console.log('Reservation cancelled successfully')
        setIsEventDetailOpen(false)
        setSelectedReservation(null)
        await fetchReservations()
        showSuccessToast({ message: '予約をキャンセルしました' })
      } else {
        toast.error('データの送信中にエラーが発生しました', {
          description: translateError(response.error || 'UNKNOWN_ERROR')
        })
      }
    } catch (err) {
      toast.error('予約のキャンセル中にエラーが発生しました', {
        description: translateError((err as Error).message)
      })
    } finally {
      setIsSending(false)
    }
  }

  const handleDelete = async (id: string) => {
    setIsDeleting(true)
    try {
      const response = await apiClient.deleteReservation(id)

      if (response.success) {
        setIsEventDetailOpen(false)
        setSelectedReservation(null)
        await fetchReservations()
        showSuccessToast({ message: '予約を完全に削除しました' })
      } else {
        toast.error('予約の削除中にエラーが発生しました', {
          description: translateError(response.error || 'UNKNOWN_ERROR')
        })
      }
    } catch (err) {
      toast.error('予約の削除中にエラーが発生しました', {
        description: translateError((err as Error).message)
      })
    } finally {
      setIsDeleting(false)
    }
  }

  const handleSelectEvent = (event: CalendarEvent) => {
    setSelectedReservation(event)
    setIsEventDetailOpen(true)
  }

  const handleUpdateReservation = async (startTime: string, endTime: string) => {
    if (!selectedReservation?.resource.reservationId) return
    try {
      setIsSending(true)
      const response = await apiClient.updateReservation(selectedReservation.resource.reservationId, {
        start_time: startTime,
        end_time: endTime,
        admin: isAdminMode || undefined,
      })
      if (!response.success) {
        toast.error('予約の変更中にエラーが発生しました', {
          description: translateError(response.error || 'UNKNOWN_ERROR'),
        })
        return
      }
      showSuccessToast({ message: '予約を変更しました' })
      setIsEventDetailOpen(false)
      setSelectedReservation(null)
      await fetchReservations()
    } catch (error) {
      toast.error('予約の変更中にエラーが発生しました', {
        description: translateError((error as Error).message),
      })
    } finally {
      setIsSending(false)
    }
  }

  const getDraftTimeValue = (hour: number | null, minute: number | null) => (
    hour === null || minute === null
      ? ''
      : `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  )

  const handleDraftTimeChange = (target: 'start' | 'end', value: string) => {
    const [hour, minute] = value.split(':').map(Number)
    setReservationDraft((previous) => ({
      ...previous,
      ...(target === 'start'
        ? {
            startHour: Number.isFinite(hour) ? hour : null,
            startMinute: Number.isFinite(minute) ? minute : null,
            endHour: null,
            endMinute: null,
          }
        : {
            endHour: Number.isFinite(hour) ? hour : null,
            endMinute: Number.isFinite(minute) ? minute : null,
          }),
    }))
  }

  const getEndTimeBound = (minutesToAdd: number) => {
    if (reservationDraft.startHour === null || reservationDraft.startMinute === null) return undefined
    const start = new Date(reservationDraft.date)
    start.setHours(reservationDraft.startHour, reservationDraft.startMinute, 0, 0)
    const bound = addMinutes(start, minutesToAdd)
    const latest = new Date(reservationDraft.date)
    latest.setHours(23, 0, 0, 0)
    return format(bound > latest ? latest : bound, 'HH:mm')
  }

  const getStartTimeMin = () => {
    const earliest = new Date(reservationDraft.date)
    earliest.setHours(6, 0, 0, 0)
    const today = startOfDay(toJSTWallClockDate(new Date()))
    if (startOfDay(reservationDraft.date).getTime() !== today.getTime()) return '06:00'

    const now = toJSTWallClockDate(new Date())
    const hadPartialMinute = now.getSeconds() > 0 || now.getMilliseconds() > 0
    now.setSeconds(0, 0)
    if (hadPartialMinute) now.setMinutes(now.getMinutes() + 1)
    return format(now > earliest ? now : earliest, 'HH:mm')
  }

  const isReservationButtonDisabled = () => {
    return isSending ||
      reservationLimitLoading ||
      reservationLimitError ||
      reservationDraft.startHour === null ||
      reservationDraft.startMinute === null ||
      reservationDraft.endHour === null ||
      reservationDraft.endMinute === null
  }

  const handleDateChange = (date: Date | undefined) => {
    if (date) {
      setCurrentDate(date)
      setIsDatePickerOpen(false)
    }
  }

  const getRangeSkip = () => {
    switch (currentView) {
      case Views.DAY:
        return 1
      case 'myRange' as View:
        return 3
      case Views.WEEK:
        return 7
      default:
        return 1
    }
  }

  const handleViewChange = (view: View) => {
    setCurrentView(view)
  }

  const handleNavigate = (date: Date, view: View) => {
    setCurrentDate(date)
    setCurrentView(view)
  }

  const handleRangeChange = () => {
    setIsEventDetailOpen(false)
    setSelectedReservation(null)
  }

  const fetchMyGroups = async () => {
    if (isGroupsLoading) return;

    try {
      setIsGroupsLoading(true);
      const response = await apiClient.getGroupOptions(isAdminMode);

      if (response.success && response.data) {
        setMyGroups(response.data);
      }
    } catch (err) {
      console.error('Failed to fetch my groups:', err);
    } finally {
      setIsGroupsLoading(false);
    }
  };

  const fetchRealtimeReservationData = useCallback(async (includeReservationLimits: boolean) => {
    try {
      const [reservationsResponse, reservationLimitsResponse] = await Promise.all([
        apiClient.getReservations(isAdminMode),
        includeReservationLimits ? apiClient.getReservationLimits() : Promise.resolve(null)
      ])

      if (reservationsResponse.success && reservationsResponse.data) {
        setReservationData(toReservationCalendarEvents(reservationsResponse.data))
      }

      if (reservationLimitsResponse?.success && reservationLimitsResponse.data) {
        setReservationLimits(reservationLimitsResponse.data)
      }

      await fetchReservationLimitRemaining()
    } catch (err) {
      console.error('Failed to sync realtime reservation data:', err)
    }
  }, [fetchReservationLimitRemaining, isAdminMode])

  useEffect(() => {
    if (!user) return

    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let closedByComponent = false
    let socket: WebSocket | null = null

    const connect = () => {
      socket = new WebSocket(apiClient.getReservationsWebSocketUrl())

      socket.onmessage = (event) => {
        let message: { type?: string }
        try {
          message = JSON.parse(String(event.data)) as { type?: string }
        } catch {
          return
        }

        if (message.type === 'reservations_changed') {
          void fetchRealtimeReservationData(false)
        }

        if (message.type === 'reservation_limits_changed') {
          void fetchRealtimeReservationData(true)
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
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
      }
      socket?.close()
    }
  }, [fetchRealtimeReservationData, user])


  const { customViews } = useMemo(
    () => ({
      customViews: {
        week: true,
        myRange: ThreeDayView,
        day: true,
      },
    }),
    []
  )

  const handleAddReservation = () => {
    setIsReservationFormOpen(true)
  }

  const handleSelectSlot = (slotInfo: SlotInfo) => {
    if (slotInfo.action !== 'select') return

    const start = new Date(slotInfo.start)
    const end = new Date(slotInfo.end)

    if (!isReservationDateValid(start)) {
      toast.error('この日は予約できません', {
        description: '予約できるのは今日から14日後までです。',
      })
      return
    }

    const validation = validateReservationTime(
      toJSTISOString(start, start.getHours(), start.getMinutes()),
      toJSTISOString(end, end.getHours(), end.getMinutes())
    )
    if (!validation.isValid) {
      toast.error('この時間は予約できません', {
        description: validation.error || '予約時間が無効です。',
      })
      return
    }

    if (!isReservationTimeValid(start, start.getHours(), start.getMinutes())) {
      toast.error('この時間は予約できません', {
        description: '過去の時間は選択できません。',
      })
      return
    }

    const overlapsUnavailablePeriod = unavailablePeriods.some(
      (period) => period.start < end && period.end > start
    )
    if (overlapsUnavailablePeriod) {
      toast.error('この時間は予約できません', {
        description: translateError('BLOCKED_PERIOD_CONFLICT'),
      })
      return
    }

    setReservationDraft((previous) => ({
      ...previous,
      date: startOfDay(start),
      startHour: start.getHours(),
      startMinute: start.getMinutes(),
      endHour: end.getHours(),
      endMinute: end.getMinutes(),
    }))
    setIsReservationFormOpen(true)
  }

  const handleRefresh = async () => {
    await fetchReservations()
  }

  const formatLimitMinutes = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const remainingMinutes = minutes % 60
    if (hours === 0) return `${remainingMinutes}分`
    if (remainingMinutes === 0) return `${hours}時間`
    return `${hours}時間${remainingMinutes}分`
  }

  const formatLimitDescription = (limit: ReservationLimit | ReservationLimitRemaining) => {
    if (limit.limit_type === 'ROLLING') {
      return `${limit.window_days}日間で${formatLimitMinutes(limit.max_minutes)}`
    }

    if (limit.start_datetime && limit.end_datetime) {
      const formatter = new Intl.DateTimeFormat('ja-JP', {
        timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
      })
      return `${formatter.format(new Date(limit.start_datetime))} 〜 ${formatter.format(new Date(limit.end_datetime))}`
    }

    return '期間限定'
  }

  const reservationLimitUsage = useMemo(() => {
    const selectedDayStart = startOfDay(reservationDraft.date)
    const selectedDayEnd = addDays(selectedDayStart, 1)

    return reservationLimitRemaining
      .filter((item) => {
        if (item.limit_type === 'ROLLING') return true
        if (!item.start_datetime || !item.end_datetime) return false
        const limitStart = toJSTWallClockDate(item.start_datetime)
        const limitEnd = toJSTWallClockDate(item.end_datetime)
        return limitStart < selectedDayEnd && limitEnd > selectedDayStart
      })
      .map((item) => ({
        limit: item,
        remainingMinutes: item.remaining_minutes,
      }))
  }, [reservationDraft.date, reservationLimitRemaining])

  const visibleReservationLimits = useMemo(() => {
    const selectedDayStart = startOfDay(reservationDraft.date)
    const selectedDayEnd = addDays(selectedDayStart, 1)

    return reservationLimits
      .filter((limit) => {
        if (limit.limit_type === 'ROLLING') return true
        if (!limit.start_datetime || !limit.end_datetime) return false
        const limitStart = toJSTWallClockDate(limit.start_datetime)
        const limitEnd = toJSTWallClockDate(limit.end_datetime)
        return limitStart < selectedDayEnd && limitEnd > selectedDayStart
      })
  }, [reservationDraft.date, reservationLimits])

  const shouldShowReservationLimits = user && !isAdmin(user.role) && visibleReservationLimits.length > 0

  return (
    <>
      <ReservationPageHeader
        onAddReservation={handleAddReservation}
        onRefresh={handleRefresh}
      />
      <div className="h-[calc(100vh-4rem)] flex flex-col" ref={calendarRef} style={{ position: 'relative' }}>
        <div className="flex-1 mx-auto px-5 w-full max-w-none">
        <Card className="bg-white shadow-lg rounded-lg overflow-hidden h-full flex flex-col">
          <CardDescription className="flex-shrink-0">
            <HallLotteries mode="calendar" />
            {loading ? (
              <div className={"p-2 flex flex-wrap gap-2 " + (isMobile ? "justify-center" : "justify-end")}>
                <Skeleton className="h-9 w-10" />
                <Skeleton className="h-9 w-40" />
                <Skeleton className="h-9 w-10" />
              </div>
            ) : (
              <div className="space-y-2">
                <div className={"p-2 pb-0 flex flex-wrap gap-2 " + (isMobile ? "justify-center" : "justify-end")}>
                  <Button variant="outline" onClick={() => handleNavigate(subDays(currentDate, getRangeSkip()), currentView)}>
                    <ChevronLeftIcon className=" h-4 w-4" />
                  </Button>
                  <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline">
                        {currentView === Views.DAY ? format(currentDate, 'yyyy年M月d日', { locale: jaLocale }) : format(currentDate, 'yyyy年M月', { locale: jaLocale })}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="center">
                      <CalendarPrimitive
                        mode="single"
                        locale={jaLocale}
                        selected={currentDate}
                        onSelect={handleDateChange}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline">
                        <CalendarRangeIcon className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuCheckboxItem checked={currentView === Views.DAY} onCheckedChange={() => handleViewChange(Views.DAY)}>１日</DropdownMenuCheckboxItem>
                      <DropdownMenuCheckboxItem checked={currentView === 'myRange' as View} onCheckedChange={() => handleViewChange('myRange' as View)}>３日</DropdownMenuCheckboxItem>
                      <DropdownMenuCheckboxItem checked={currentView === Views.WEEK} onCheckedChange={() => handleViewChange(Views.WEEK)} disabled={isMobile}>週</DropdownMenuCheckboxItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button variant="outline" onClick={() => handleNavigate(addDays(currentDate, getRangeSkip()), currentView)}>
                    <ChevronRightIcon className=" h-4 w-4" />
                  </Button>
                </div>
                {shouldShowReservationLimits && (
                  <div className="px-2 pb-2">
                    <div className="flex flex-wrap gap-2 rounded-md border bg-gray-50 p-2">
                      {visibleReservationLimits.map((limit) => (
                        <div key={limit.id} className="flex min-w-0 items-center gap-2 rounded border bg-white px-2 py-1 text-xs text-gray-700">
                          <Badge variant={limit.scope === 'PERSONAL' ? 'default' : 'outline'} className="shrink-0 text-xs">
                            {limit.scope === 'PERSONAL' ? '個人' : '団体'}
                          </Badge>
                          <span className="font-medium shrink-0">{formatLimitMinutes(limit.max_minutes)}</span>
                          <span className="truncate">{formatLimitDescription(limit)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardDescription>
          <CardContent className="flex-1">
            {loading ? (
              <div className="w-full h-[720px]">
                <Skeleton className="w-full h-full" />
              </div>
            ) : (
              <>
              {reservationError && <ToastNotice message={reservationError} retry={() => void handleRefresh()} />}
              <BigCalendar
                className="reservation-calendar"
                localizer={localizer}
                events={[...reservationData, ...events, ...unavailablePeriods]}
                titleAccessor={(event: CalendarEvent) => event.title}
                startAccessor={(event: CalendarEvent) => event.start}
                endAccessor={(event: CalendarEvent) => event.end}
                allDayAccessor={(event: CalendarEvent) => event.allDay || false}
                onSelectEvent={handleSelectEvent}
                selectable="ignoreEvents"
                onSelectSlot={handleSelectSlot}
                step={10}
                timeslots={6}
                longPressThreshold={250}
                views={customViews}
                messages={messages}
                culture='ja'
                toolbar={false}
                min={new Date(0, 0, 0, 6, 0, 0)}
                max={new Date(0, 0, 0, 23, 0, 0)}
                date={currentDate}
                view={currentView}
                onView={handleViewChange}
                onNavigate={handleNavigate}
                formats={{
                  dayFormat: (date) => format(date, 'dd日（eee）', { locale: jaLocale }),
                  dayHeaderFormat: (date) => format(date, 'yyyy年M月d日（eee）', { locale: jaLocale }),
                  dayRangeHeaderFormat: (dates) => format(dates.start, 'yyyy年M月d日', { locale: jaLocale }) + ' 〜 ' + format(dates.end, 'M月d日', { locale: jaLocale }),
                  eventTimeRangeFormat: (event) => format(event.start, 'H:mm', { locale: jaLocale }) + ' 〜 ' + format(event.end, 'H:mm', { locale: jaLocale })
                }}
                eventPropGetter={(event: CalendarEvent) => {
                  if (event.resource.type === 'event') {
                    return {
                      style: {
                        backgroundColor: '#4A90E2',
                        color: 'white',
                        border: '2px solid #357ABD'
                      }
                    };
                  }
                  if (event.resource.type === 'unavailable') {
                    return {
                      style: {
                        backgroundColor: '#FF6B6B',
                        color: 'white',
                        border: '2px solid #CC5555'
                      }
                    };
                  }
                  return {
                    style: {
                      backgroundColor: (() => {
                        switch (event.resource.state) {
                          case ReservationState.PENDING:
                            return '#FFE599';
                          case ReservationState.DECLINED:
                            return '#F9C6C0';
                          case ReservationState.CONFIRMED:
                            return '#C8E6CD';
                          default:
                            return '#D5D8DC';
                        }
                      })(),
                      color: 'black',
                      border: '2px solid ' + (() => {
                        switch (event.resource.state) {
                          case ReservationState.PENDING:
                            return '#F1C40F';
                          case ReservationState.DECLINED:
                            return '#E74C3C';
                          case ReservationState.CONFIRMED:
                            return '#2ECC71';
                          default:
                            return '#BDC3C7';
                        }
                      })()
                    }
                  };
                }}
                onRangeChange={handleRangeChange}
              />
              </>
            )}
          </CardContent>
        </Card>
      </div>
      {selectedReservation && (
        <ReservationDetailsDialog
          key={selectedReservation.id}
          open={isEventDetailOpen}
          onClose={() => { setIsEventDetailOpen(false); setSelectedReservation(null) }}
          title={selectedReservation.resource.type === 'unavailable' ? '予約禁止詳細' : selectedReservation.resource.type === 'event' ? 'イベント詳細' : '予約'}
          subject={`${selectedReservation.title} / ${format(selectedReservation.start, 'yyyy年M月d日 H:mm')}〜${format(selectedReservation.end, 'H:mm')}`}
          busy={isSending || isDeleting || isStatusUpdating}
          editor={selectedReservation.resource.type === 'reservation' && selectedReservation.resource.cancellable && (isAdminMode || !selectedReservation.resource.is_lottery) && selectedReservation.resource.end_time && new Date(selectedReservation.resource.end_time) > new Date() ? {
            start: new Date(selectedReservation.resource.start_time!),
            end: new Date(selectedReservation.resource.end_time),
            onSave: handleUpdateReservation,
          } : undefined}
          onCancel={selectedReservation.resource.cancellable ? () => void handleCancel(selectedReservation.resource.reservationId!) : undefined}
          onDelete={isAdminMode && selectedReservation.resource.reservationId ? () => void handleDelete(selectedReservation.resource.reservationId!) : undefined}
        >
          {selectedReservation.resource.type === 'reservation' ? (
            <>
              <p><strong>予約者</strong> {selectedReservation.resource.user_name}</p>
              {selectedReservation.resource.group_name && <p><strong>グループ</strong> {selectedReservation.resource.group_name}</p>}
              {isAdminMode && selectedReservation.resource.reservationId && selectedReservation.resource.state ? (
                <ReservationStatusSelect
                  value={selectedReservation.resource.state}
                  onBusyChange={setIsStatusUpdating}
                  save={(state) => apiClient.updateReservationStatus(selectedReservation.resource.reservationId!, { state })}
                  read={async () => {
                    const response = await apiClient.getReservations(true)
                    const actual = response.data?.find((item) => item.id === selectedReservation.resource.reservationId)
                    if (!response.success || !actual) throw new Error('RESERVATION_FETCH_FAILED')
                    setReservationData(toReservationCalendarEvents(response.data!))
                    return actual.state as ReservationState
                  }}
                  onConfirmed={(state) => {
                    setSelectedReservation((current) => current ? { ...current, resource: { ...current.resource, state } } : current)
                    return fetchReservations()
                  }}
                />
              ) : selectedReservation.resource.state && <p><strong>ステータス</strong> {eventStateNames[selectedReservation.resource.state]}</p>}
              {!(selectedReservation.resource.cancellable && (isAdminMode || !selectedReservation.resource.is_lottery) && selectedReservation.resource.end_time && new Date(selectedReservation.resource.end_time) > new Date()) && (
                <p><strong>時間</strong> {format(selectedReservation.start, 'yyyy年M月d日 H:mm')}〜{format(selectedReservation.end, 'H:mm')}</p>
              )}
            </>
          ) : (
            <>
              <p>{selectedReservation.title}</p>
              <p>{format(selectedReservation.start, 'yyyy年M月d日 H:mm')}〜{format(selectedReservation.end, 'M月d日 H:mm')}</p>
              {selectedReservation.resource.reason && <p>{selectedReservation.resource.reason}</p>}
            </>
          )}
        </ReservationDetailsDialog>
      )}

      <DraftDialog open={isReservationFormOpen} onOpenChange={setIsReservationFormOpen} title="新規予約" draft={reservationDraft} onDiscard={setReservationDraft} busy={isSending}>
            <form onSubmit={handleSubmit} className="space-y-4">
              <fieldset disabled={isSending} className="space-y-4">
              <div>
                <Label className="text-sm font-medium">予約名義</Label>
                <Select
                  onValueChange={(value) => setReservationDraft({ ...reservationDraft, group: value === 'none' ? null : value })}
                  value={reservationDraft.group || 'none'}
                  defaultValue='none'
                  onOpenChange={(open) => {
                    if (open && myGroups.length === 0) {
                      fetchMyGroups();
                    }
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-[200px]">
                    <SelectItem value="none">
                      {user?.nickname || '個人'}
                    </SelectItem>
                    {isGroupsLoading ? (
                      <div className="flex items-center justify-center p-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="ml-2 text-sm text-gray-500">読み込み中...</span>
                      </div>
                    ) : (
                      myGroups.map((group) => (
                        <SelectItem key={group.id} value={group.id}>
                          <div className="flex items-center justify-between w-full gap-2">
                            <span>{group.name}</span>
                            <Badge variant={group.main_index !== null ? "default" : "outline"} className="text-sm px-1.5 py-0 shrink-0">
                              {group.main_index !== null ? '本バンド' : '自由バンド'}
                            </Badge>
                          </div>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                {reservationLimitUsage.length > 0 && (
                  <div className="mt-2 space-y-1 rounded-md border bg-gray-50 p-2 text-xs text-gray-700">
                    {reservationLimitUsage.map(({ limit, remainingMinutes }) => (
                      <div key={limit.id} className="flex flex-wrap items-center justify-between gap-2">
                        <span>{formatLimitDescription(limit)}</span>
                        <span className="font-medium">
                          残り {formatLimitMinutes(remainingMinutes)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {reservationLimitLoading && <Skeleton className="mt-2 h-5 w-full" />}
                {reservationLimitError && <ToastNotice message="予約上限の残り時間を確認できません。再読み込みしてください。" retry={() => void fetchReservationLimitRemaining()} />}

              </div>
              <div className="space-y-2">
                <Label htmlFor="date" className="text-sm font-medium">予約日</Label>
                <Input
                  id="date"
                  type="date"
                  min={format(startOfDay(toJSTWallClockDate(new Date())), 'yyyy-MM-dd')}
                  max={format(addDays(startOfDay(toJSTWallClockDate(new Date())), 14), 'yyyy-MM-dd')}
                  value={format(reservationDraft.date, 'yyyy-MM-dd')}
                  onChange={(event) => {
                    const date = new Date(`${event.target.value}T00:00:00`)
                    if (!Number.isNaN(date.getTime()) && isReservationDateValid(date)) {
                      handleReservationDateSelect(date)
                    }
                  }}
                  required
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="reservation-start-time" className="text-sm font-medium">開始時刻</Label>
                  <Input
                    id="reservation-start-time"
                    type="time"
                    min={getStartTimeMin()}
                    max="22:50"
                    step={60}
                    value={getDraftTimeValue(reservationDraft.startHour, reservationDraft.startMinute)}
                    onChange={(event) => handleDraftTimeChange('start', event.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reservation-end-time" className="text-sm font-medium">終了時刻</Label>
                  <Input
                    id="reservation-end-time"
                    type="time"
                    min={getEndTimeBound(MIN_RESERVATION_MINUTES)}
                    max={getEndTimeBound(240)}
                    step={60}
                    value={getDraftTimeValue(reservationDraft.endHour, reservationDraft.endMinute)}
                    disabled={reservationDraft.startHour === null || reservationDraft.startMinute === null}
                    onChange={(event) => handleDraftTimeChange('end', event.target.value)}
                    required
                  />
                </div>
              </div>
              <DialogFooter>
                <LoadingButton
                  type="submit"
                  isLoading={isSending}
                  disabled={isReservationButtonDisabled()}
                  className={cn(
                    isReservationButtonDisabled() && "opacity-50 cursor-not-allowed"
                  )}
                >
                  予約
                </LoadingButton>
              </DialogFooter>
              </fieldset>
            </form>
      </DraftDialog>
      </div>
    </>
  )
}
