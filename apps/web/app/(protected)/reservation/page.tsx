'use client'

import React, { useState, useRef, useMemo, useEffect } from 'react'
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
import { ScrollArea } from "@/components/ui/scroll-area"
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, AlertCircle, Loader2, AlertTriangle, CalendarRangeIcon } from 'lucide-react'
import { toast } from 'sonner'
import { translateError } from '@/lib/error-label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { ReservationData, ReservationState, eventStateNames } from '../../types'
import { validateReservationTime, isReservationDateValid, isReservationTimeValid } from '@shared-schemas'
type GroupOption = {
  id: string;
  name: string;
}

type CalendarEvent = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  resource: {
    type: 'reservation' | 'event' | 'unavailable';
    reservationId?: string;
    eventId?: string;
    periodId?: string;
    reason?: string | null;
    user_name?: string;
    group_name?: string;
    state?: ReservationState;
    cancellable?: number;
  };
}
import { apiClient } from '@/lib/api'
import TimeGrid from 'react-big-calendar/lib/TimeGrid'
import { DropdownMenu, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useAuth } from '../../context/AuthContext'
import { ReservationPageHeader } from '@/components/reservation-page-header'
import { Skeleton } from '@/components/ui/skeleton'
import { useRouter } from 'next/navigation'


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
  const end = addDays(start, 2) // 三日間

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
  const [isMobile, setIsMobile] = useState(false)
  const [isAdminMode, setIsAdminMode] = useState(false)
  const [reservationDraft, setReservationDraft] = useState({
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
  const [currentView, setCurrentView] = useState<View>(Views.WEEK)
  const [isEventDetailOpen, setIsEventDetailOpen] = useState(false)
  const [reservationData, setReservationData] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [myGroups, setMyGroups] = useState<GroupOption[]>([])
  const [isGroupsLoading, setIsGroupsLoading] = useState(false)
  const [events, setEvents] = useState<any[]>([])
  const [unavailablePeriods, setUnavailablePeriods] = useState<any[]>([])
  const { user, loading: authLoading } = useAuth();
  const router = useRouter()

  useEffect(() => {
    const init = async () => {
      if (authLoading) return
      if (!user) {
        router.push('/login')
        return
      }
      if (!user.nickname) {
        router.push('/profile')
        return
      }
      try {
        const [reservationsResponse, eventsResponse, unavailablePeriodsResponse] = await Promise.all([
          apiClient.getReservations(),
          apiClient.getEvents(),
          apiClient.getUnavailablePeriods()
        ]);
        
        if (reservationsResponse.success && reservationsResponse.data) {
          const formattedData: CalendarEvent[] = (reservationsResponse.data as any[]).map((item: any) => ({
            id: item.id,
            title: item.group_name || item.user_name || '予約',
            start: new Date(item.start_time),
            end: new Date(item.end_time),
            allDay: false,
            resource: {
              type: 'reservation',
              reservationId: item.id,
              user_name: item.user_name,
              group_name: item.group_name,
              state: item.state,
              cancellable: item.cancellable,
            },
          }));
          setReservationData(formattedData);
        }

        if (eventsResponse.success && eventsResponse.data) {
          const eventItems: CalendarEvent[] = (eventsResponse.data as any[]).map((event: any) => {
            const eventDate = new Date(event.event_date);
            const startDate = startOfDay(eventDate);
            const endDate = new Date(startDate);
            endDate.setHours(23, 59, 59, 999);
            
            return {
              id: `event-${event.id}`,
              title: event.title,
              start: startDate,
              end: endDate,
              allDay: true,
              resource: {
                type: 'event',
                eventId: event.id,
              },
            };
          });
          setEvents(eventItems);
        }

        if (unavailablePeriodsResponse.success && unavailablePeriodsResponse.data) {
          const periodItems: CalendarEvent[] = (unavailablePeriodsResponse.data as any[]).map((period: any) => {
            const start = new Date(period.start_datetime);
            const end = new Date(period.end_datetime);
            
            return {
                id: `unavailable-${period.id}`,
              title: `予約不可`,
                start: start,
                end: end,
                allDay: false,
              resource: {
                type: 'unavailable',
                periodId: period.id,
                reason: period.reason,
              },
            };
          });
          setUnavailablePeriods(periodItems);
        }
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [authLoading, user, router])

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
      });

      if (response.success) {
        toast.success('予約を送信しました')
        
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
        toast.success('予約をキャンセルしました')
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

  const handleSelectEvent = (event: CalendarEvent, e: React.SyntheticEvent<HTMLElement>) => {
    setSelectedReservation(event)
    setIsEventDetailOpen(true)
  }

  const generateHourOptions = () => {
    return Array.from({ length: 17 }, (_, i) => i + 6)
  }

  const generateMinuteOptions = () => {
    return Array.from({ length: 12 }, (_, i) => i * 5)
  }

  const maxDate = addDays(new Date(), 14)

  const isStartTimeDisabled = (hour: number, minute: number) => {
    return !isReservationTimeValid(reservationDraft.date, hour, minute);
  }

  const isEndTimeDisabled = (hour: number, minute: number) => {
    if (reservationDraft.startHour === null || reservationDraft.startMinute === null) return true
    const startDate = new Date(reservationDraft.date)
    startDate.setHours(reservationDraft.startHour, reservationDraft.startMinute)
    const endDate = new Date(reservationDraft.date)
    endDate.setHours(hour, minute)
    const minEndTime = addMinutes(startDate, 10)
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
      const response = await apiClient.getGroupOptions();
      
      if (response.success && response.data) {
        setMyGroups(response.data);
      }
    } catch (err) {
      console.error('Failed to fetch my groups:', err);
    } finally {
      setIsGroupsLoading(false);
    }
  };

  const fetchReservations = async () => {
    try {
      const [reservationsResponse, eventsResponse, unavailablePeriodsResponse] = await Promise.all([
        apiClient.getReservations(),
        apiClient.getEvents(),
        apiClient.getUnavailablePeriods()
      ]);
      
      if (reservationsResponse.success && reservationsResponse.data) {
        const formattedData: CalendarEvent[] = (reservationsResponse.data as any[]).map((item: any) => ({
          id: item.id,
          title: item.group_name || item.user_name || '予約',
          start: new Date(item.start_time),
          end: new Date(item.end_time),
          allDay: false,
          resource: {
            type: 'reservation',
            reservationId: item.id,
            user_name: item.user_name,
            group_name: item.group_name,
            state: item.state,
            cancellable: item.cancellable,
          },
        }));
        setReservationData(formattedData);
      }

      if (eventsResponse.success && eventsResponse.data) {
        const eventItems: CalendarEvent[] = (eventsResponse.data as any[]).map((event: any) => {
          const eventDate = new Date(event.event_date);
          const startDate = startOfDay(eventDate);
          const endDate = new Date(startDate);
          endDate.setHours(23, 59, 59, 999);
          
          return {
            id: `event-${event.id}`,
            title: event.title,
            start: startDate,
            end: endDate,
            allDay: true,
            resource: {
              type: 'event',
              eventId: event.id,
            },
          };
        });
        setEvents(eventItems);
      }

      if (unavailablePeriodsResponse.success && unavailablePeriodsResponse.data) {
        const periodItems: CalendarEvent[] = (unavailablePeriodsResponse.data as any[]).map((period: any) => {
          const start = new Date(period.start_datetime);
          const end = new Date(period.end_datetime);
          
          return {
              id: `unavailable-${period.id}`,
              title: `予約不可${period.reason ? ': ' + period.reason : ''}`,
              start: start,
              end: end,
              allDay: false,
            resource: {
              type: 'unavailable',
              periodId: period.id,
              reason: period.reason,
            },
          };
        });
        setUnavailablePeriods(periodItems);
      }
    } catch (err) {
      console.error('Failed to refetch reservation data:', err);
    }
  }


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

  const handleAdminToggle = async (checked: boolean) => {
    setIsAdminMode(checked)
    await fetchReservations()
  }

  return (
    <>
      <ReservationPageHeader 
        onAddReservation={handleAddReservation}
        onRefresh={handleRefresh}
        onAdminToggle={handleAdminToggle}
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
              <div className={"p-2 flex flex-wrap gap-2 " + (isMobile ? "justify-center" : "justify-end")}>
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
                 startAccessor={(event: any) => event.start}
                 endAccessor={(event: any) => event.end}
                 allDayAccessor={(event: any) => event.allDay || false}
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
          setSelectedReservation(null)
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
                    >
                      キャンセル
                    </LoadingButton>
                  )}
                </>
              )}
        </div>
      )}
        </DialogContent>
      </Dialog>
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
                  <SelectContent>
                    <ScrollArea className="max-h-[200px]">
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
                            {group.name}
                          </SelectItem>
                        ))
                      )}
                    </ScrollArea>
                  </SelectContent>
                </Select>
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
                          handleInputChange('date', date)
                          handleInputChange('startHour', null)
                          handleInputChange('startMinute', null)
                          handleInputChange('endHour', null)
                          handleInputChange('endMinute', null)
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
                    value={reservationDraft.startHour?.toString() || ''}
                  >
                    <SelectTrigger id="startHour">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-[200px]">
                      <ScrollArea>
                        {generateHourOptions().filter(hour => !isStartTimeDisabled(hour + 1, 0)).map((hour) => (
                          <SelectItem key={hour} value={hour.toString()}>
                            {hour.toString().padStart(2, '0')}
                          </SelectItem>
                        ))}
                      </ScrollArea>
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
                    value={reservationDraft.startMinute?.toString() || ''}
                    disabled={reservationDraft.startHour === null}
                  >
                    <SelectTrigger id="startMinute">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-[200px]">
                      <ScrollArea>
                        {generateMinuteOptions().filter(minute => reservationDraft.startHour !== null && !isStartTimeDisabled(reservationDraft.startHour, minute)).map((minute) => (
                          <SelectItem key={minute} value={minute.toString()}>
                            {minute.toString().padStart(2, '0')}
                          </SelectItem>
                        ))}
                      </ScrollArea>
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
                    value={reservationDraft.endHour?.toString() || ''}
                    disabled={reservationDraft.startMinute === null}
                  >
                    <SelectTrigger id="endHour">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-[200px]">
                      <ScrollArea>
                        {generateHourOptions().filter(hour => {
                          if (reservationDraft.startHour === null || reservationDraft.startMinute === null) return false
                          const startDate = new Date(reservationDraft.date)
                          startDate.setHours(reservationDraft.startHour, reservationDraft.startMinute)
                          const minEndTime = addMinutes(startDate, 10)
                          const maxEndTime = addHours(startDate, 4)
                          const endDateAt0 = new Date(reservationDraft.date)
                          endDateAt0.setHours(hour, 0)
                          const endDateAt55 = new Date(reservationDraft.date)
                          endDateAt55.setHours(hour, 55)
                          const hasValidMinute = (!isBefore(endDateAt0, minEndTime) && endDateAt0.getTime() <= maxEndTime.getTime()) ||
                                                 (!isBefore(endDateAt55, minEndTime) && endDateAt55.getTime() <= maxEndTime.getTime())
                          return hasValidMinute
                        }).map((hour) => (
                          <SelectItem key={hour} value={hour.toString()}>
                            {hour.toString().padStart(2, '0')}
                          </SelectItem>
                        ))}
                      </ScrollArea>
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
                    value={reservationDraft.endMinute?.toString() || ''}
                    disabled={reservationDraft.endHour === null}
                  >
                    <SelectTrigger id="endMinute">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-[200px]">
                      <ScrollArea>
                        {generateMinuteOptions().filter(minute => reservationDraft.endHour !== null && !isEndTimeDisabled(reservationDraft.endHour, minute)).map((minute) => (
                          <SelectItem key={minute} value={minute.toString()}>
                            {minute.toString().padStart(2, '0')}
                          </SelectItem>
                        ))}
                      </ScrollArea>
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