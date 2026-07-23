'use client'

import React, { Suspense, useState, useRef, useMemo, useEffect, useCallback } from 'react'
import { Calendar as BigCalendar, dateFnsLocalizer, Views, View, Navigate, DateLocalizer } from 'react-big-calendar'
import { Calendar as CalendarPrimitive } from "@/components/ui/calendar"
import { format, parse, startOfWeek, getDay, addDays, addMinutes, addHours, isBefore, startOfDay, subDays } from 'date-fns'
import { ja as jaLocale } from 'date-fns/locale'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import { Card, CardContent, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { LoadingButton } from "@/components/ui/loading-button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, AlertCircle, Loader2, CalendarRangeIcon, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { translateError } from '@/lib/error-label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn, showSuccessToast } from "@/lib/utils"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { ReservationState, eventStateNames } from '../../types'
import { validateReservationTime, isReservationDateValid, isReservationTimeValid, isAdmin, type ReservationLimit, type ReservationLimitRemaining } from '@shared-schemas'
import {
  adjustReservationDraftForDate,
  MIN_RESERVATION_MINUTES,
  toEventCalendarEvents,
  toReservationCalendarEvents,
  toUnavailableCalendarEvents,
  type CalendarEvent,
  type ReservationDraft,
} from './reservation-calendar'
type GroupOption = {
  id: string;
  name: string;
  is_main: boolean;
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
import { ReservationEditDialog } from '@/components/reservation-edit-dialog'


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

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ReservationContent />
    </Suspense>
  )
}

function ReservationContent() {
  const [isMobile, setIsMobile] = useState(false)
  const [reservationDraft, setReservationDraft] = useState<ReservationDraft>({
    date: startOfDay(new Date()),
    group: null as string | null,
    startHour: null as number | null,
    startMinute: null as number | null,
    endHour: null as number | null,
    endMinute: null as number | null,
  })
  const [isReservationFormOpen, setIsReservationFormOpen] = useState(false)
  const [selectedReservation, setSelectedReservation] = useState<CalendarEvent | null>(null)
  const [openPicker, setOpenPicker] = useState<string | null>(null)
  const [currentDate, setCurrentDate] = useState(new Date())
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false)
  const [isFormDatePickerOpen, setIsFormDatePickerOpen] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isDeleteConfirming, setIsDeleteConfirming] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isStatusUpdating, setIsStatusUpdating] = useState(false)
  const [selectedStatus, setSelectedStatus] = useState<ReservationState>(ReservationState.PENDING)
  const [currentView, setCurrentView] = useState<View>(Views.WEEK)
  const [isEventDetailOpen, setIsEventDetailOpen] = useState(false)
  const [reservationData, setReservationData] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [myGroups, setMyGroups] = useState<GroupOption[]>([])
  const [isGroupsLoading, setIsGroupsLoading] = useState(false)
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [unavailablePeriods, setUnavailablePeriods] = useState<CalendarEvent[]>([])
  const [reservationLimits, setReservationLimits] = useState<ReservationLimit[]>([])
  const [reservationLimitRemaining, setReservationLimitRemaining] = useState<ReservationLimitRemaining[]>([])
  const { user, loading: authLoading } = useAuth();
  const [isAdminMode, setIsAdminMode] = useAdminMode(user && isAdmin(user.role));
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const fetchReservationLimitRemaining = useCallback(async () => {
    if (!user) return

    const scope = reservationDraft.group ? 'GROUP' : 'PERSONAL'
    const targetId = reservationDraft.group || user.id
    const referenceTime = startOfDay(reservationDraft.date).toISOString()

    try {
      const response = await apiClient.getReservationLimitRemaining(scope, targetId, referenceTime)
      if (response.success && response.data) {
        setReservationLimitRemaining(response.data)
      } else {
        setReservationLimitRemaining([])
      }
    } catch (err) {
      console.error('Failed to fetch reservation limit remaining:', err)
      setReservationLimitRemaining([])
    }
  }, [user, reservationDraft.group, reservationDraft.date])

  const fetchReservations = useCallback(async () => {
    try {
      const [reservationsResponse, eventsResponse, unavailablePeriodsResponse, reservationLimitsResponse] = await Promise.all([
        apiClient.getReservations(isAdminMode),
        apiClient.getEvents(),
        apiClient.getUnavailablePeriods(),
        apiClient.getReservationLimits(),
      ])

      if (reservationsResponse.success && reservationsResponse.data) {
        setReservationData(toReservationCalendarEvents(reservationsResponse.data))
      }
      if (eventsResponse.success && eventsResponse.data) {
        setEvents(toEventCalendarEvents(eventsResponse.data))
      }
      if (unavailablePeriodsResponse.success && unavailablePeriodsResponse.data) {
        setUnavailablePeriods(toUnavailableCalendarEvents(unavailablePeriodsResponse.data))
      }
      if (reservationLimitsResponse.success && reservationLimitsResponse.data) {
        setReservationLimits(reservationLimitsResponse.data)
      }
    } catch (error) {
      console.error('Failed to fetch reservation data:', error)
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
        await fetchReservations()
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [authLoading, user, router, pathname, searchParams, fetchReservations])

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(/Mobi|Android/i.test(navigator.userAgent))
    }
    checkMobile()
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

  const handleInputChange = (name: string, value: number | Date | string | null) => {
    setReservationDraft(prev => {
      const updated = { ...prev, [name]: value }

      if (name === 'startHour') {
        updated.startMinute = null
        updated.endHour = null
        updated.endMinute = null
      }

      if (name === 'startMinute') {
        updated.endHour = null
        updated.endMinute = null
      }

      if (name === 'endHour') {
        updated.endMinute = null
      }

      return updated
    })
  }

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

    const start = new Date(reservationDraft.date)
    start.setHours(reservationDraft.startHour, reservationDraft.startMinute)
    const end = new Date(reservationDraft.date)
    end.setHours(reservationDraft.endHour, reservationDraft.endMinute)

    const validation = validateReservationTime(start.toISOString(), end.toISOString());
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
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        admin: isAdminMode || undefined,
      });

      if (response.success) {
        showSuccessToast({ message: '予約を送信しました' })
        
        setReservationDraft({
          date: new Date(),
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
        setIsDeleteConfirming(false)
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
    setIsDeleteConfirming(false)
    setSelectedReservation(event)
    if (event.resource.state) {
      setSelectedStatus(event.resource.state)
    }
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
      setIsEditOpen(false)
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

  const handleUpdateStatus = async () => {
    if (!selectedReservation?.resource.reservationId) return
    try {
      setIsStatusUpdating(true)
      const response = await apiClient.updateReservationStatus(
        selectedReservation.resource.reservationId,
        { state: selectedStatus }
      )
      if (!response.success) {
        toast.error('ステータスの変更中にエラーが発生しました', {
          description: translateError(response.error || 'UNKNOWN_ERROR'),
        })
        return
      }
      showSuccessToast({ message: 'ステータスを変更しました' })
      setIsEventDetailOpen(false)
      setSelectedReservation(null)
      await fetchReservations()
    } catch (error) {
      toast.error('ステータスの変更中にエラーが発生しました', {
        description: translateError((error as Error).message),
      })
    } finally {
      setIsStatusUpdating(false)
    }
  }

  const generateStartHourOptions = () => {
    return Array.from({ length: 17 }, (_, i) => i + 6)
  }

  const generateEndHourOptions = () => {
    return Array.from({ length: 18 }, (_, i) => i + 6)
  }

  const generateMinuteOptions = () => {
    return Array.from({ length: 12 }, (_, i) => i * 5)
  }


  const isStartTimeDisabled = (hour: number, minute: number) => {
    return !isReservationTimeValid(reservationDraft.date, hour, minute);
  }

  const isStartTimeSelectable = (hour: number, minute: number) => {
    if (isStartTimeDisabled(hour, minute)) return false
    const startDate = new Date(reservationDraft.date)
    startDate.setHours(hour, minute, 0, 0)
    const latestEndTime = new Date(reservationDraft.date)
    latestEndTime.setHours(23, 0, 0, 0)
    return addMinutes(startDate, MIN_RESERVATION_MINUTES).getTime() <= latestEndTime.getTime()
  }

  const isStartHourSelectable = (hour: number) => {
    return generateMinuteOptions().some((minute) => isStartTimeSelectable(hour, minute))
  }

  const isEndHourSelectable = (hour: number) => {
    if (reservationDraft.startHour === null || reservationDraft.startMinute === null) return false
    return generateMinuteOptions().some((minute) => !isEndTimeDisabled(hour, minute))
  }

  const isEndTimeDisabled = (hour: number, minute: number) => {
    if (reservationDraft.startHour === null || reservationDraft.startMinute === null) return true
    const startDate = new Date(reservationDraft.date)
    startDate.setHours(reservationDraft.startHour, reservationDraft.startMinute, 0, 0)
    const endDate = new Date(reservationDraft.date)
    endDate.setHours(hour, minute, 0, 0)
    const minEndTime = addMinutes(startDate, MIN_RESERVATION_MINUTES)
    const maxEndTime = addHours(startDate, 4)
    if (isBefore(endDate, minEndTime)) return true
    if (endDate.getTime() > maxEndTime.getTime()) return true
    return false
  }

  const isReservationButtonDisabled = () => {
    return isSending ||
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

  const handleRefresh = async () => {
    await fetchReservations()
  }

  const handleAdminToggle = (checked: boolean) => {
    setIsAdminMode(checked)
    setMyGroups([])
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
      return `${format(new Date(limit.start_datetime), 'M/d H:mm', { locale: jaLocale })} 〜 ${format(new Date(limit.end_datetime), 'M/d H:mm', { locale: jaLocale })}`
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
        const limitStart = new Date(item.start_datetime)
        const limitEnd = new Date(item.end_datetime)
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
        const limitStart = new Date(limit.start_datetime)
        const limitEnd = new Date(limit.end_datetime)
        return limitStart < selectedDayEnd && limitEnd > selectedDayStart
      })
  }, [reservationDraft.date, reservationLimits])

  const shouldShowReservationLimits = user && !isAdmin(user.role) && visibleReservationLimits.length > 0

  return (
    <>
      <ReservationPageHeader 
        onAddReservation={handleAddReservation}
        onRefresh={handleRefresh}
        onAdminToggle={handleAdminToggle}
        isAdminMode={isAdminMode}
      />
      <div className="h-[calc(100vh-4rem)] flex flex-col" ref={calendarRef} style={{ position: 'relative' }}>
        <div className="flex-1 mx-auto px-5 w-full max-w-none">
        <Card className="bg-white shadow-lg rounded-lg overflow-hidden h-full flex flex-col">
          <CardDescription className="flex-shrink-0">
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
              <BigCalendar
                localizer={localizer}
                events={[...reservationData, ...events, ...unavailablePeriods]}
                 titleAccessor={(event: CalendarEvent) => event.title}
                 startAccessor={(event: CalendarEvent) => event.start}
                 endAccessor={(event: CalendarEvent) => event.end}
                 allDayAccessor={(event: CalendarEvent) => event.allDay || false}
                onSelectEvent={handleSelectEvent}
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
            )}
          </CardContent>
        </Card>
      </div>
      <Dialog open={isEventDetailOpen && selectedReservation !== null} onOpenChange={(open) => {
        setIsEventDetailOpen(open)
        if (!open) {
          setIsEditOpen(false)
          setSelectedReservation(null)
          setIsDeleteConfirming(false)
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedReservation?.resource.type === 'unavailable' ? '予約禁止詳細' : 
               selectedReservation?.resource.type === 'event' ? 'イベント詳細' : 
               '予約詳細'}
            </DialogTitle>
          </DialogHeader>
          {selectedReservation && (
            <div className="space-y-4">
              {selectedReservation.resource.type === 'unavailable' ? (
                <div className="space-y-2">
                  <p><strong>時間</strong> {format(selectedReservation.start, 'M月d日 H:mm', { locale: jaLocale })} 〜 {format(selectedReservation.end, 'M月d日 H:mm', { locale: jaLocale })}</p>
                  {selectedReservation.resource.reason && (
                    <p><strong>理由</strong> {selectedReservation.resource.reason}</p>
                  )}
                </div>
              ) : selectedReservation.resource.type === 'event' ? (
                <div className="space-y-2">
                  <p><strong>タイトル</strong> {selectedReservation.title}</p>
                  <p><strong>日付</strong> {format(selectedReservation.start, 'yyyy年M月d日', { locale: jaLocale })}</p>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
            <p><strong>時間</strong> {format(selectedReservation.start, 'H:mm', { locale: jaLocale })} 〜 {format(selectedReservation.end, 'H:mm', { locale: jaLocale })}</p>
                    <p><strong>予約者</strong> {selectedReservation.resource.user_name}</p>
                    {selectedReservation.resource.group_name && <p><strong>グループ</strong> {selectedReservation.resource.group_name}</p>}
                    {selectedReservation.resource.state && (
                      <p><strong>ステータス</strong> {eventStateNames[selectedReservation.resource.state]}</p>
                    )}
                  </div>
                  {selectedReservation.resource.cancellable === 1 && selectedReservation.end > new Date() && (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={() => setIsEditOpen(true)}
                      disabled={isSending || isDeleting || isDeleteConfirming}
                    >
                      変更
                    </Button>
                  )}
                  {selectedReservation.resource.cancellable === 1 && (
                    <LoadingButton 
                      onClick={() => {
                        if (selectedReservation.resource.reservationId) {
                          handleCancel(selectedReservation.resource.reservationId)
                        }
                      }}
                      variant="destructive" 
                      className="w-full" 
                      isLoading={isSending}
                      disabled={isDeleting || isDeleteConfirming}
                    >
                      キャンセル
                    </LoadingButton>
                  )}
                  {isAdminMode && selectedReservation.resource.reservationId && (
                    <div className="space-y-3">
                      <div className="space-y-2 rounded-md border p-3">
                        <Label htmlFor="reservation-status">ステータス</Label>
                        <Select
                          value={selectedStatus}
                          onValueChange={(value) => setSelectedStatus(value as ReservationState)}
                        >
                          <SelectTrigger id="reservation-status">
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
                          onClick={handleUpdateStatus}
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
                          disabled={isSending || isDeleting}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          完全に削除
                        </Button>
                      )}
                      {isDeleteConfirming && (
                        <Alert variant="destructive">
                          <AlertCircle className="h-4 w-4" />
                          <AlertTitle>この予約を完全に削除しますか？</AlertTitle>
                          <AlertDescription className="mt-2 space-y-3">
                            <p>この予約はキャンセルや拒否として残らず、予約情報そのものが完全に削除されます。削除後は元に戻せません。</p>
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
                                onClick={() => handleDelete(selectedReservation.resource.reservationId!)}
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
                </>
              )}
        </div>
      )}
        </DialogContent>
      </Dialog>
      {selectedReservation?.resource.type === 'reservation' && (
        <ReservationEditDialog
          open={isEditOpen}
          onOpenChange={setIsEditOpen}
          start={selectedReservation.start}
          end={selectedReservation.end}
          isSaving={isSending}
          onSave={handleUpdateReservation}
        />
      )}
      <Dialog open={isReservationFormOpen} onOpenChange={setIsReservationFormOpen}>
          <DialogContent>
            <DialogTitle className="text-xl font-semibold">新規予約</DialogTitle>
            <Alert className="p-1">
              <div className="flex items-center gap-1">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>注意事項</AlertTitle>
              </div>
              <AlertDescription>
                <ul className="list-disc pl-6 text-sm">
                  <li>二週間以上先の予約を取ることはできません。</li>
                  <li>日をまたいで予約することはできません。</li>
                  <li>利用時間は最短10分から最長4時間です。</li>
                  <li>ホールは朝6時から夜11時まで利用できます。</li>
                </ul>
              </AlertDescription>
            </Alert>
            <form onSubmit={handleSubmit} className="space-y-4">
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
                            <Badge variant={group.is_main ? "default" : "outline"} className="text-sm px-1.5 py-0 shrink-0">
                              {group.is_main ? '本バンド' : '自由バンド'}
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
              </div>
              <div>
                <Label htmlFor="date" className="text-sm font-medium">予約日</Label>
                <Popover open={isFormDatePickerOpen} onOpenChange={setIsFormDatePickerOpen} modal={true}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {reservationDraft.date ? format(reservationDraft.date, "PPP", { locale: jaLocale }) : <span>日付を選択</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarPrimitive
                      mode="single"
                      selected={reservationDraft.date}
                      onSelect={(date) => {
                        if (date) {
                          handleReservationDateSelect(date)
                        }
                        setIsFormDatePickerOpen(false)
                      }}
                      disabled={(date) =>
                        !isReservationDateValid(date)
                      }
                      initialFocus
                      locale={jaLocale}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="startHour" className="text-sm font-medium">開始時刻（時）</Label>
                  <Select
                    open={openPicker === 'startHour'}
                    onOpenChange={(isOpen) => {
                      if (isOpen) setOpenPicker('startHour')
                      else setOpenPicker(null)
                    }}
                    onValueChange={(value) => handleInputChange('startHour', parseInt(value))}
                    value={reservationDraft.startHour !== null ? reservationDraft.startHour.toString() : ''}
                  >
                    <SelectTrigger id="startHour">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-[200px]">
                      {generateStartHourOptions().filter(isStartHourSelectable).map((hour) => (
                        <SelectItem key={hour} value={hour.toString()}>
                          {hour.toString().padStart(2, '0')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="startMinute" className="text-sm font-medium">開始時刻（分）</Label>
                  <Select
                    open={openPicker === 'startMinute'}
                    onOpenChange={(isOpen) => {
                      if (isOpen) setOpenPicker('startMinute')
                      else setOpenPicker(null)
                    }}
                    onValueChange={(value) => handleInputChange('startMinute', parseInt(value))}
                    value={reservationDraft.startMinute !== null ? reservationDraft.startMinute.toString() : ''}
                    disabled={reservationDraft.startHour === null}
                  >
                    <SelectTrigger id="startMinute">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-[200px]">
                      {generateMinuteOptions().filter(minute => reservationDraft.startHour !== null && isStartTimeSelectable(reservationDraft.startHour, minute)).map((minute) => (
                        <SelectItem key={minute} value={minute.toString()}>
                          {minute.toString().padStart(2, '0')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="endHour" className="text-sm font-medium">終了時刻（時）</Label>
                  <Select
                    open={openPicker === 'endHour'}
                    onOpenChange={(isOpen) => {
                      if (isOpen) setOpenPicker('endHour')
                      else setOpenPicker(null)
                    }}
                    onValueChange={(value) => handleInputChange('endHour', parseInt(value))}
                    value={reservationDraft.endHour !== null ? reservationDraft.endHour.toString() : ''}
                    disabled={reservationDraft.startMinute === null}
                  >
                    <SelectTrigger id="endHour">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-[200px]">
                      {generateEndHourOptions().filter(isEndHourSelectable).map((hour) => (
                        <SelectItem key={hour} value={hour.toString()}>
                          {hour.toString().padStart(2, '0')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="endMinute" className="text-sm font-medium">終了時刻（分）</Label>
                  <Select
                    open={openPicker === 'endMinute'}
                    onOpenChange={(isOpen) => {
                      if (isOpen) setOpenPicker('endMinute')
                      else setOpenPicker(null)
                    }}
                    onValueChange={(value) => handleInputChange('endMinute', parseInt(value))}
                    value={reservationDraft.endMinute !== null ? reservationDraft.endMinute.toString() : ''}
                    disabled={reservationDraft.endHour === null}
                  >
                    <SelectTrigger id="endMinute">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-[200px]">
                      {generateMinuteOptions().filter(minute => reservationDraft.endHour !== null && !isEndTimeDisabled(reservationDraft.endHour, minute)).map((minute) => (
                        <SelectItem key={minute} value={minute.toString()}>
                          {minute.toString().padStart(2, '0')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <LoadingButton
                type="submit"
                isLoading={isSending}
                disabled={isReservationButtonDisabled()}
                className={cn(
                  "w-full",
                  isReservationButtonDisabled() && "opacity-50 cursor-not-allowed"
                )}
              >
                予約
              </LoadingButton>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </>
  )
}
