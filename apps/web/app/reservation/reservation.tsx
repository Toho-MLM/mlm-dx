'use client'

import React, { useState, useRef, useMemo, useEffect } from 'react'
import { Calendar as BigCalendar, dateFnsLocalizer, Views, View, Navigate, DateLocalizer } from 'react-big-calendar'
import { Calendar as CalendarPrimitive } from "@/components/ui/calendar"
import { format, parse, startOfWeek, getDay, addDays, addMinutes, addHours, isBefore, startOfDay, subDays } from 'date-fns'
import { ja as jaLocale } from 'date-fns/locale'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import { Card, CardContent, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ScrollArea } from "@/components/ui/scroll-area"
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, AlertCircle, Loader2, AlertTriangle, CalendarRangeIcon, CalendarX2, CalendarPlus } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { ReservationData, ReservationHolder, ReservationState, eventStateNames } from '../types'
import { apiClient } from '@/lib/api'
import TimeGrid from 'react-big-calendar/lib/TimeGrid'
import { DropdownMenu, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import Fab from '@mui/material/Fab';
import { useAuth } from '../context/AuthContext'


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

export function ReservationPage({ initialReservationData, initialUserHolder }: { initialReservationData: ReservationData[], initialUserHolder: ReservationHolder[] }) {
  const [isMobile, setIsMobile] = useState(false)
  const [reservationDraft, setReservationDraft] = useState({
    date: startOfDay(new Date()),
    group: null as string | null,
    startHour: null as number | null,
    startMinute: null as number | null,
    endHour: null as number | null,
    endMinute: null as number | null,
  })
  const [isReservationFormOpen, setIsReservationFormOpen] = useState(false)
  const [isCancelFormOpen, setIsCancelFormOpen] = useState(false)
  const [selectedReservation, setSelectedReservation] = useState<ReservationData | null>(null)
  const [openPicker, setOpenPicker] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [currentDate, setCurrentDate] = useState(new Date())
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false)
  const [isFormDatePickerOpen, setIsFormDatePickerOpen] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [currentView, setCurrentView] = useState<View>(Views.WEEK)
  const [isEventDetailOpen, setIsEventDetailOpen] = useState(false)
  const [popoverPosition, setPopoverPosition] = useState<{ y: number; x: number } | null>(null)
  const [reservationData, setReservationData] = useState<ReservationData[]>(initialReservationData)
  const [userHolder, setUserHolder] = useState<ReservationHolder[]>(initialUserHolder)
  const { user } = useAuth();

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

    const currentHour = new Date().getHours();
    if (currentHour >= 0 && currentHour < 1) {
      setErrorMessage('現在、予約処理中のため予約を作成できません。1時以降に再度お試しください。');
      return;
    }

    try {
      setIsSending(true)
      
      const selectedHolder = userHolder.find(holder => holder.id === reservationDraft.group);
      const isPersonalReservation = !selectedHolder || selectedHolder.id === null;
      
      const response = await apiClient.createReservation({
        holder_user_id: isPersonalReservation ? user?.id : undefined,
        holder_group_id: !isPersonalReservation && reservationDraft.group ? reservationDraft.group : undefined,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
      });

      if (response.success) {
        console.log('Reservation created successfully')
        setReservationDraft({
          date: new Date(),
          group: null,
          startHour: null,
          startMinute: null,
          endHour: null,
          endMinute: null,
        })
        setErrorMessage(null)
        setIsReservationFormOpen(false)
        await refetchReservationData()
      } else {
        setErrorMessage('データの送信中にエラーが発生しました。' + response.error);
      }
    } catch (err) {
      setErrorMessage((err as Error).message);
    } finally {
      setIsSending(false);
    }
  }

  const handleCancel = async (id: number) => {
    setIsSending(true)
    try {
      const response = await apiClient.cancelReservation(id);
      
      if (response.success) {
        console.log('Reservation cancelled successfully')
        setSelectedReservation(null)
        setIsCancelFormOpen(false)
        await refetchReservationData()
      } else {
        setErrorMessage('データの送信中にエラーが発生しました。' + response.error)
      }
    } catch (err) {
      setErrorMessage((err as Error).message);
    } finally {
      setIsSending(false)
    }
  }

  const handleSelectEvent = (event: ReservationData, e: React.SyntheticEvent<HTMLElement>) => {
    if (calendarRef.current) {
      const calendarRect = calendarRef.current.getBoundingClientRect()
      const mouseEvent = e.nativeEvent as MouseEvent
      const relativeX = mouseEvent.clientX - calendarRect.left
      const relativeY = mouseEvent.clientY - calendarRect.top
      setPopoverPosition({ y: relativeY, x: relativeX })
    }
    setIsEventDetailOpen(true)
    setSelectedReservation(event)
  }

  const generateHourOptions = () => {
    return Array.from({ length: 17 }, (_, i) => i + 6)
  }

  const generateMinuteOptions = () => {
    return Array.from({ length: 12 }, (_, i) => i * 5)
  }

  const maxDate = addDays(new Date(), 14)

  const isStartTimeDisabled = (hour: number, minute: number) => {
    const now = new Date()
    const selectedDate = new Date(reservationDraft.date)
    selectedDate.setHours(hour)
    selectedDate.setMinutes(minute)
    return isBefore(selectedDate, now) || hour < 6 || (hour === 23 && minute > 0)
  }

  const isEndTimeDisabled = (hour: number, minute: number) => {
    if (reservationDraft.startHour === null || reservationDraft.startMinute === null) return true
    const startDate = new Date(reservationDraft.date)
    startDate.setHours(reservationDraft.startHour, reservationDraft.startMinute)
    const endDate = new Date(reservationDraft.date)
    endDate.setHours(hour, minute)
    const minEndTime = addMinutes(startDate, 30)
    const maxEndTime = addHours(startDate, 4)
    return isBefore(endDate, minEndTime) || endDate.getTime() > maxEndTime.getTime()
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

  const closePopover = () => {
    setIsEventDetailOpen(false)
    setSelectedReservation(null)
    setPopoverPosition(null)
  }

  const handleRangeChange = () => {
    setIsEventDetailOpen(false)
    setPopoverPosition(null)
  }

  const refetchReservationData = async () => {
    try {
      const [reservationsResponse, userHolderResponse] = await Promise.all([
        apiClient.getReservations(),
        apiClient.getUserHolder()
      ]);

      if (reservationsResponse.success && reservationsResponse.data) {
        const formattedData: ReservationData[] = (reservationsResponse.data as any[]).map((item: any) => ({
          ...item,
          start: new Date(item.start_time),
          end: new Date(item.end_time),
        }));
        setReservationData(formattedData);
      }

      if (userHolderResponse.success && userHolderResponse.data) {
        const userHolderData = userHolderResponse.data as any;
        const result: ReservationHolder[] = [];
        result.push({
          name: userHolderData.user.nickname,
          id: null
        });
        
        userHolderData.bands.forEach((band: { name: string; id: string }) => {
          result.push({
            name: band.name,
            id: band.id
          });
        });
        setUserHolder(result);
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

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col" ref={calendarRef} style={{ position: 'relative' }}>
      <div className="flex-1 mx-auto px-5 w-full max-w-none">
        <Card className="bg-white shadow-lg rounded-lg overflow-hidden h-full flex flex-col">
          <CardDescription className="flex-shrink-0">
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
          </CardDescription>
          <CardContent className="flex-1">
            <BigCalendar
              localizer={localizer}
              events={reservationData}
               titleAccessor={(event) => event.creator_name || '予約'}
               startAccessor={(event) => event.start}
               endAccessor={(event) => event.end}
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
              eventPropGetter={(event) => ({
                style: {
                  backgroundColor: (() => {
                    switch (event.state) {
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
                    switch (event.state) {
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
              })}
              onRangeChange={handleRangeChange}
            />
          </CardContent>
        </Card>
      </div>
      {isEventDetailOpen && selectedReservation && popoverPosition && (
        <div
          className="absolute bg-white border rounded-lg shadow-lg p-4 max-w-xs"
          style={{
            top: popoverPosition.y,
            left: popoverPosition.x,
            transform: 'translate(-50%, 0%)',
            zIndex: 10
          }}
        >
          <div>
            <p><strong>ID</strong> # {selectedReservation.id}</p>
            <p><strong>時間</strong> {format(selectedReservation.start, 'H:mm', { locale: jaLocale })} 〜 {format(selectedReservation.end, 'H:mm', { locale: jaLocale })}</p>
            <p><strong>作成者</strong> {selectedReservation.creator_name}</p>
            {selectedReservation.holder_group_name && <p><strong>グループ</strong> {selectedReservation.holder_group_name}</p>}
            <p><strong>ステータス</strong> {eventStateNames[selectedReservation.state]}</p>
            <Button onClick={closePopover} variant="outline" className="mt-2 w-full">
              閉じる
            </Button>
          </div>
        </div>
      )}
      <div className="fixed bottom-4 right-4 flex flex-col gap-2">
        <Dialog open={isReservationFormOpen} onOpenChange={setIsReservationFormOpen}>
          <DialogTrigger asChild>
            <Fab color="primary" aria-label="add">
              <CalendarPlus />
            </Fab>
          </DialogTrigger>
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
                  <li>利用時間は最短30分から最長4時間です。</li>
                  <li>ホールは朝6時から夜11時まで利用できます。</li>
                  <li>予約が処理される午前0〜1時の間は予約できません。</li>
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
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <ScrollArea className="max-h-[200px]">
                      {userHolder.map((holder) => (
                        <SelectItem key={holder.id} value={holder.id || 'none'}>
                          {holder.name}
                        </SelectItem>
                      ))}
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
                        date > maxDate || isBefore(date, startOfDay(new Date()))
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
                        {generateHourOptions().filter(hour => !isEndTimeDisabled(hour + 1, 0)).map((hour) => (
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
              <Button
                type="submit"
                disabled={isReservationButtonDisabled()}
                className={cn(
                  "w-full",
                  isReservationButtonDisabled() && "opacity-50 cursor-not-allowed"
                )}
              >
                {isSending && <Loader2 className="h-4 w-4 animate-spin" />}
                予約
              </Button>
            </form>
            {errorMessage && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>エラー</AlertTitle>
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
            )}
          </DialogContent>
        </Dialog>
        <Dialog open={isCancelFormOpen} onOpenChange={setIsCancelFormOpen}>
          <DialogTrigger asChild>
            <Fab color="error" aria-label="cancel">
              <CalendarX2/>
              <span className="sr-only">Cancel Calendar</span>
            </Fab>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle className="text-xl font-semibold">予約のキャンセル</DialogTitle>
            </DialogHeader>
            {selectedReservation ? (
              selectedReservation.cancellable === 1 ? (
                  <div className="space-y-4">
                    <p className="text-sm text-gray-600 dark:text-gray-300">以下の予約をキャンセルしますか？</p>
                    <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-md">
                      <p><strong>ID</strong> # {selectedReservation.id}</p>
                      <p><strong>時間</strong> {format(selectedReservation.start, 'H:mm', { locale: jaLocale })} 〜 {format(selectedReservation.end, 'H:mm', { locale: jaLocale })}</p>
                      <p><strong>作成者</strong> {selectedReservation.creator_name}</p>
                      {selectedReservation.holder_group_name && <p><strong>グループ</strong> {selectedReservation.holder_group_name}</p>}
                      <p><strong>ステータス</strong> {eventStateNames[selectedReservation.state]}</p>
                    </div>
                    <Button onClick={() => handleCancel(selectedReservation.id)} variant="destructive" className="w-full" disabled={isSending}>
                      {isSending && <Loader2 className="h-4 w-4 animate-spin" />}
                      キャンセル
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-gray-600 dark:text-gray-300">この予約はキャンセルできません。</p>
                )
            ) : (
              <p className="text-sm text-gray-600 dark:text-gray-300">キャンセルしたい予約を選択してください。</p>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>

  )
}