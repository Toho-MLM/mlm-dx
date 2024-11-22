'use client'

import React, { useState, useRef, useEffect, useMemo } from 'react'
import { Calendar as BigCalendar, dateFnsLocalizer, Views, View, Navigate, DateLocalizer } from 'react-big-calendar'
import { Calendar as CalendarPrimitive } from "@/components/ui/calendar"
import { format, parse, startOfWeek, getDay, addDays, addMinutes, addHours, isBefore, setHours, setMinutes, startOfDay, set } from 'date-fns'
import { is, ja as jaLocale } from 'date-fns/locale'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ScrollArea } from "@/components/ui/scroll-area"
import { CalendarIcon, PlusCircleIcon, XCircleIcon, ChevronLeftIcon, ChevronRightIcon, AlertCircle, Loader2, AlertTriangle, CalendarRangeIcon, Info } from 'lucide-react'
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
import { supabase } from '@/supabase/supabaseClient'
// @ts-ignore
import TimeGrid from 'react-big-calendar/lib/TimeGrid'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

const locales = {
  'ja': jaLocale,
}

function isMobile() {
  return /Mobi|Android/i.test(navigator.userAgent);
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
  [key: string]: any
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

ThreeDayView.navigate = (date: Date, action: string, { localizer }: { localizer: DateLocalizer }) => {
  switch (action) {
    case Navigate.PREVIOUS:
      return addDays(date, -3)
    case Navigate.NEXT:
      return addDays(date, 3)
    default:
      return date
  }
}

ThreeDayView.title = (date: Date, options: any) => {
  const start = format(date, 'MM/dd', { locale: jaLocale })
  const end = format(addDays(date, 2), 'MM/dd', { locale: jaLocale })
  return `3日間表示: ${start} - ${end}`
}

export function ReservationPage({ reservationData, userName }: { reservationData: ReservationData[], userName: string }) {
  const [reservationDraft, setReservationDraft] = useState({
    date: new Date(),
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
  const [isSending, setIsSending] = useState(false)
  const [reservationHolders, setReservationHolders] = useState<ReservationHolder[]>([{ name: userName, id: null }])
  const [currentView, setCurrentView] = useState<View>(
    isMobile() ? 'myRange' as View : Views.WEEK
  )
  const [isEventDetailOpen, setIsEventDetailOpen] = useState(false)
  const [popoverPosition, setPopoverPosition] = useState<{ top: number; left: number } | null>(null)

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
      setErrorMessage('すべての項目を入力してください。')
      return
    }

    const start = new Date(reservationDraft.date)
    start.setHours(reservationDraft.startHour, reservationDraft.startMinute)
    const end = new Date(reservationDraft.date)
    end.setHours(reservationDraft.endHour, reservationDraft.endMinute)

    if (end.getTime() - start.getTime() < 30 * 60 * 1000) {
      setErrorMessage('予約時間は30分以上にしてください。')
      return
    }

    if (end.getTime() - start.getTime() > 4 * 60 * 60 * 1000) {
      setErrorMessage('予約時間は4時間以内にしてください。')
      return
    }

    if (start.getHours() < 6 || end.getHours() > 23 || (end.getHours() === 23 && end.getMinutes() > 0)) {
      setErrorMessage('予約時間は朝6時から夜11時までの間で設定してください。')
      return
    }

    try {
      setIsSending(true)
      const { data, error } = await supabase.rpc('create_reservation', {
        p_group: reservationDraft.group,
        p_start_time: start.toISOString(),
        p_end_time: end.toISOString(),
        p_notes: null,
      });
      if (error) {
        console.error(error)
        setErrorMessage('データの送信中にエラーが発生しました。' + error.message);
      } else if (data === null) {
        setErrorMessage('データの受信中にエラーが発生しました。');
      } else if ('error' in data) {
        setErrorMessage('データの処理中にエラーが発生しました。' + data.details);
      } else {
        console.log(data.message)
        setIsReservationFormOpen(false)
      }
    } catch (err) {
      setErrorMessage((err as Error).message);
    } finally {
      setIsSending(false);
    }
  }

  const handleCancel = async (id: string) => {
    setIsSending(true)
    try {
      const { data, error } = await supabase.rpc('cancel_reservation', {
        p_id: id,
      })
      if (error) {
        console.error(error)
        setErrorMessage('データの送信中にエラーが発生しました。' + error.message)
      } else if (data === null) {
        setErrorMessage('データの受信中にエラーが発生しました。')
      } else if ('error' in data) {
        setErrorMessage('データの処理中にエラーが発生しました。' + data.details)
      } else {
        console.log(data.message)
        setSelectedReservation(null)
        setIsCancelFormOpen(false)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setIsSending(false)
    }
  }

  const handleSelectEvent = (event: ReservationData, e: React.SyntheticEvent<HTMLElement>) => {
    console.log(event)
    if (calendarRef.current) {
      const calendarRect = calendarRef.current.getBoundingClientRect()
      const mouseEvent = e.nativeEvent as MouseEvent
      const relativeX = mouseEvent.clientX - calendarRect.left
      const relativeY = mouseEvent.clientY - calendarRect.top
      setPopoverPosition({ top: relativeY, left: relativeX })
    }
    setIsEventDetailOpen(true)
    setSelectedReservation(event)
  }

  const generateHourOptions = () => {
    return Array.from({ length: 18 }, (_, i) => i + 6)
  }

  const generateMinuteOptions = () => {
    return Array.from({ length: 12 }, (_, i) => i * 5)
  }

  const maxDate = addDays(new Date(), 14)

  const isTimeDisabled = (hour: number, minute: number) => {
    const now = new Date()
    const selectedDate = new Date(reservationDraft.date)
    const selectedTime = setMinutes(setHours(selectedDate, hour), minute)
    return isBefore(selectedTime, now) || hour < 6 || hour >= 23
  }

  const isEndTimeDisabled = (hour: number, minute: number) => {
    if (reservationDraft.startHour === null || reservationDraft.startMinute === null) return true
    const startDate = new Date(reservationDraft.date)
    startDate.setHours(reservationDraft.startHour, reservationDraft.startMinute)
    const endDate = new Date(reservationDraft.date)
    endDate.setHours(hour, minute)
    const minEndTime = addMinutes(startDate, 30)
    const maxEndTime = addHours(startDate, 4)
    return isBefore(endDate, minEndTime) || endDate.getTime() > maxEndTime.getTime() || hour > 23 || (hour === 23 && minute > 0)
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
    <div className="h-screen" ref={calendarRef} style={{ position: 'relative' }}>
      <div className="mx-auto p-5 min-w-fit">
        <Card className="bg-white shadow-lg rounded-lg overflow-hidden h-full">
          <CardHeader className="bg-gray-100 p-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <CardTitle className="text-2xl font-semibold text-gray-800">ホール予約</CardTitle>
            </div>
          </CardHeader>
          <CardDescription>
            <div className="p-5 flex flex-wrap gap-2 justify-end">
              <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline">
                    <CalendarIcon className=" h-4 w-4" />
                    {currentView === 'day' ? format(currentDate, 'yyyy年M月d日', { locale: jaLocale }) : format(currentDate, 'yyyy年M月', { locale: jaLocale })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="center">
                  <CalendarPrimitive
                    mode="single"
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
                  <DropdownMenuItem onClick={() => handleViewChange('day')}>日</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleViewChange('myRange' as View)}>3日</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleViewChange('week')}>週</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </CardDescription>
          <CardContent>
            <BigCalendar
              localizer={localizer}
              events={reservationData}
              titleAccessor={(event) => event.creator}
              startAccessor={(event) => event.start_time}
              endAccessor={(event) => event.end_time}
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
          className="absolute bg-white border rounded shadow-lg p-4 max-w-xs"
          style={{
            top: popoverPosition.top,
            left: popoverPosition.left,
            zIndex: 10,
          }}
        >
          <div>
            <p><strong>ID</strong> # {selectedReservation.id}</p>
            <p><strong>時間</strong> {format(selectedReservation.start_time, 'H:mm', { locale: jaLocale })} 〜 {format(selectedReservation.end_time, 'H:mm', { locale: jaLocale })}</p>
            <p><strong>作成者</strong> {selectedReservation.creator}</p>
            {selectedReservation.group && <p><strong>グループ</strong> {selectedReservation.group}</p>}
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
            <Button size="icon" variant="secondary" className="bg-blue-500 hover:bg-blue-600 text-white rounded-full">
              <PlusCircleIcon className="h-4 w-4" />
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="text-xl font-semibold">新規予約</DialogTitle>
            </DialogHeader>
            <Alert className="my-4">
              <div className="flex items-center gap-1">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>注意事項</AlertTitle>
              </div>
              <AlertDescription>
                <ul className="list-disc pl-5 text-sm">
                  <li>二週間以上先の予約を取ることはできません。</li>
                  <li>予約の上限は4件です。</li>
                  <li>日をまたいで予約することはできません。</li>
                  <li>利用時間は30分から4時間までで選択してください。</li>
                  <li>ホールは朝6時から夜11時まで利用できます。</li>
                </ul>
              </AlertDescription>
            </Alert>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="reservationName" className="text-sm font-medium">予約名義</Label>
                <Select
                  onValueChange={(value) => handleInputChange('reservationName', value === 'none' ? null : value)}
                  value={reservationDraft.group || 'none'}
                  defaultValue={'none'}
                >
                  <SelectTrigger id="reservationName" className="w-full">
                    <SelectValue placeholder="予約名義を選択" />
                  </SelectTrigger>
                  <SelectContent>
                    <ScrollArea className="max-h-[200px]">
                      {reservationHolders.map((option) => (
                        <SelectItem key={option.id} value={option.id || 'none'}>
                          {option.name}
                        </SelectItem>
                      ))}
                    </ScrollArea>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="date" className="text-sm font-medium">予約日</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant={"outline"}
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
                        {generateHourOptions().filter(hour => !isTimeDisabled(hour, 0)).map((hour) => (
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
                        {generateMinuteOptions().filter(minute => reservationDraft.startHour !== null && !isTimeDisabled(reservationDraft.startHour, minute)).map((minute) => (
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
                        {generateHourOptions().filter(hour => !isEndTimeDisabled(hour, 0)).map((hour) => (
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
            <Button size="icon" variant="secondary" className="bg-red-500 hover:bg-red-600 text-white rounded-full">
              <XCircleIcon className="h-4 w-4" />
              <span className="sr-only">Cancel Calendar</span>
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle className="text-xl font-semibold">予約取消</DialogTitle>
            </DialogHeader>
            {selectedReservation ? (
              <div className="space-y-4">
                <p className="text-sm text-gray-600 dark:text-gray-300">以下の予約をキャンセルしますか？</p>
                <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-md">
                  <p><strong>ID</strong> # {selectedReservation.id}</p>
                  <p><strong>時間</strong> {format(selectedReservation.start_time, 'H:mm', { locale: jaLocale })} 〜 {format(selectedReservation.end_time, 'H:mm', { locale: jaLocale })}</p>
                </div>
                <Button onClick={() => handleCancel(selectedReservation.id)} variant="destructive" className="w-full" disabled={isSending}>
                  {isSending && <Loader2 className="h-4 w-4 animate-spin" />}
                  キャンセル
                </Button>
              </div>
            ) : (
              <p className="text-sm text-gray-600 dark:text-gray-300">キャンセルしたい予約を選択してください。</p>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>

  )
}