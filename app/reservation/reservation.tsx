'use client'

import React, { useState } from 'react'
import { Calendar as BigCalendar, dateFnsLocalizer, Event, Views } from 'react-big-calendar'
import { Calendar as CalendarPrimitive } from "@/components/ui/calendar"
import { format, parse, startOfWeek, getDay, addDays, addMinutes, addHours, subMonths, addMonths, isBefore, isSameDay, setHours, setMinutes } from 'date-fns'
import { ja as jaLocale } from 'date-fns/locale'
import enUS from 'date-fns/locale/en-US'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ScrollArea } from "@/components/ui/scroll-area"
import { CalendarIcon, PlusCircleIcon, XCircleIcon, ChevronLeftIcon, ChevronRightIcon, AlertCircle } from 'lucide-react'
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

const locales = {
  'ja': jaLocale,
  'en-US': enUS,
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
  work_week: '稼働週',
  day: '日',
  month: '月',
  previous: '前',
  next: '次',
  today: '今日',
  agenda: '予定リスト',
  showMore: (total: number) => `+${total} 件`,
}

type Reservation = {
  id: number;
  title: string;
  start: Date;
  end: Date;
}

export function ReservationPage() {
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [newReservation, setNewReservation] = useState({
    reservationName: '',
    date: new Date(),
    startHour: null as number | null,
    startMinute: null as number | null,
    endHour: null as number | null,
    endMinute: null as number | null,
  })
  const [isNewReservationOpen, setIsNewReservationOpen] = useState(false)
  const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null)
  const [userName, setUserName] = useState('ユーザー名')
  const [openPicker, setOpenPicker] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [currentDate, setCurrentDate] = useState(new Date())
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false)

  const reservationOptions = [userName]

  const handleInputChange = (name: string, value: number | Date | string | null) => {
    setNewReservation(prev => {
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (
      !newReservation.reservationName ||
      newReservation.startHour === null ||
      newReservation.startMinute === null ||
      newReservation.endHour === null ||
      newReservation.endMinute === null
    ) {
      setErrorMessage('すべての項目を入力してください。')
      return
    }

    const start = new Date(newReservation.date)
    start.setHours(newReservation.startHour, newReservation.startMinute)
    const end = new Date(newReservation.date)
    end.setHours(newReservation.endHour, newReservation.endMinute)

    if (isBefore(start, new Date())) {
      setErrorMessage('過去の日時は選択できません。')
      return
    }

    const twoWeeksLater = addDays(new Date(), 14)
    if (isBefore(twoWeeksLater, start)) {
      setErrorMessage('二週間以上先の予約を取ることはできません。')
      return
    }

    if (!isSameDay(start, end)) {
      setErrorMessage('日をまたいで予約することはできません。')
      return
    }

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

    const reservation: Reservation = {
      id: Date.now(),
      title: newReservation.reservationName,
      start,
      end,
    }

    try {
      setReservations(prev => [...prev, reservation])
      setIsNewReservationOpen(false)
      setErrorMessage(null)
      setNewReservation(prev => ({
        ...prev,
        date: new Date(),
        startHour: null,
        startMinute: null,
        endHour: null,
        endMinute: null,
      }))
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '予約の作成中にエラーが発生しました。')
    }
  }

  const handleCancel = (id: number) => {
    setReservations(prev => prev.filter(reservation => reservation.id !== id))
    setSelectedReservation(null)
  }

  const handleSelectEvent = (event: Event) => {
    setSelectedReservation(event as Reservation)
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
    const selectedDate = new Date(newReservation.date)
    const selectedTime = setMinutes(setHours(selectedDate, hour), minute)
    return isBefore(selectedTime, now) || hour < 6 || hour >= 23
  }

  const isEndTimeDisabled = (hour: number, minute: number) => {
    if (newReservation.startHour === null || newReservation.startMinute === null) return true
    const startDate = new Date(newReservation.date)
    startDate.setHours(newReservation.startHour, newReservation.startMinute)
    const endDate = new Date(newReservation.date)
    endDate.setHours(hour, minute)
    const minEndTime = addMinutes(startDate, 30)
    const maxEndTime = addHours(startDate, 4)
    return isBefore(endDate, minEndTime) || endDate.getTime() > maxEndTime.getTime() || hour > 23 || (hour === 23 && minute > 0)
  }

  const isReservationButtonDisabled = () => {
    return !newReservation.reservationName ||
           newReservation.startHour === null ||
           newReservation.startMinute === null ||
           newReservation.endHour === null ||
           newReservation.endMinute === null
  }

  const handleDateChange = (date: Date | undefined) => {
    if (date) {
      setCurrentDate(date)
      setIsDatePickerOpen(false)
    }
  }

  return (
    <div>
      <div className="mx-auto px-5 mt-5 min-w-fit">
        <Card className="bg-white shadow-lg rounded-lg overflow-hidden h-full">
          <CardHeader className="bg-gray-100 p-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <CardTitle className="text-2xl font-semibold text-gray-800 dark:text-gray-100">ホール予約</CardTitle>
            </div>
          </CardHeader>
          <CardDescription>
          <div className="flex flex-wrap gap-2">
                <Dialog open={isNewReservationOpen} onOpenChange={setIsNewReservationOpen}>
                  <DialogTrigger asChild>
                    <Button className="bg-blue-500 hover:bg-blue-600 text-white">
                      <PlusCircleIcon className="mr-2 h-4 w-4" />
                      新規予約
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                      <DialogTitle className="text-xl font-semibold">新規予約</DialogTitle>
                    </DialogHeader>
                    <Alert className="my-4">
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>注意事項</AlertTitle>
                      <AlertDescription>
                        <ul className="list-disc pl-5 text-sm">
                          <li>二週間以上先の予約を取ることはできません。</li>
                          <li>予約の上限は4件です。</li>
                          <li>日をまたいで予約することはできません。</li>
                          <li>終了時刻は開始時刻の30分後から4時間後での間で選択してください。</li>
                          <li>予約時間は朝6時から夜11時までの間で設定してください。</li>
                        </ul>
                      </AlertDescription>
                    </Alert>
                    {errorMessage && (
                      <Alert variant="destructive" className="my-4">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>エラー</AlertTitle>
                        <AlertDescription>{errorMessage}</AlertDescription>
                      </Alert>
                    )}
                    <form onSubmit={handleSubmit} className="space-y-4">
                      <div>
                        <Label htmlFor="reservationName" className="text-sm font-medium">予約名義</Label>
                        <Select
                          onValueChange={(value) => handleInputChange('reservationName', value)}
                          value={newReservation.reservationName}
                        >
                          <SelectTrigger id="reservationName" className="w-full">
                            <SelectValue placeholder="予約名義を選択" />
                          </SelectTrigger>
                          <SelectContent>
                            <ScrollArea className="h-[200px] max-h-[200px]">
                              {reservationOptions.map((option) => (
                                <SelectItem key={option} value={option}>
                                  {option}
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
                              className={cn(
                                "w-full justify-start text-left font-normal",
                                !newReservation.date && "text-muted-foreground"
                              )}
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {newReservation.date ? format(newReservation.date, "PPP", { locale: jaLocale }) : <span>日付を選択</span>}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <CalendarPrimitive
                              mode="single"
                              selected={newReservation.date}
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
                                date > maxDate || isBefore(date, new Date())
                              }
                              initialFocus
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
                            value={newReservation.startHour?.toString() || ''}
                          >
                            <SelectTrigger id="startHour">
                              <SelectValue placeholder="時" />
                            </SelectTrigger>
                            <SelectContent>
                              <ScrollArea className="h-[200px] max-h-[200px]">
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
                            value={newReservation.startMinute?.toString() || ''}
                            disabled={newReservation.startHour === null}
                          >
                            <SelectTrigger id="startMinute">
                              <SelectValue placeholder="分" />
                            </SelectTrigger>
                            <SelectContent>
                              <ScrollArea className="h-[200px] max-h-[200px]">
                                {generateMinuteOptions().filter(minute => newReservation.startHour !== null && !isTimeDisabled(newReservation.startHour, minute)).map((minute) => (
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
                            value={newReservation.endHour?.toString() || ''}
                            disabled={newReservation.startMinute === null}
                          >
                            <SelectTrigger id="endHour">
                              <SelectValue placeholder="時" />
                            </SelectTrigger>
                            <SelectContent>
                              <ScrollArea className="h-[200px] max-h-[200px]">
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
                            value={newReservation.endMinute?.toString() || ''}
                            disabled={newReservation.endHour === null}
                          >
                            <SelectTrigger id="endMinute">
                              <SelectValue placeholder="分" />
                            </SelectTrigger>
                            <SelectContent>
                              <ScrollArea className="h-[200px] max-h-[200px]">
                                {generateMinuteOptions().filter(minute => newReservation.endHour !== null && !isEndTimeDisabled(newReservation.endHour, minute)).map((minute) => (
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
                        予約
                      </Button>
                    </form>
                  </DialogContent>
                </Dialog>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="destructive">
                      <XCircleIcon className="mr-2 h-4 w-4" />
                      予約取消
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
                          <p><strong>予約名:</strong> {selectedReservation.title}</p>
                          <p><strong>開始:</strong> {format(selectedReservation.start, 'yyyy/MM/dd HH:mm', { locale: jaLocale })}</p>
                          <p><strong>終了:</strong> {format(selectedReservation.end, 'yyyy/MM/dd HH:mm', { locale: jaLocale })}</p>
                        </div>
                        <Button onClick={() => handleCancel(selectedReservation.id)} variant="destructive" className="w-full">
                          キャンセル
                        </Button>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-600 dark:text-gray-300">予約を選択しください。</p>
                    )}
                  </DialogContent>
                </Dialog>
                <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      日付選択
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <div className="flex justify-between items-center p-2">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setCurrentDate(prevDate => subMonths(prevDate, 1))}
                      >
                        <ChevronLeftIcon className="h-4 w-4" />
                      </Button>
                      <div>{format(currentDate, 'yyyy年MM月', { locale: jaLocale })}</div>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setCurrentDate(prevDate => addMonths(prevDate, 1))}
                      >
                        <ChevronRightIcon className="h-4 w-4" />
                      </Button>
                    </div>
                    <CalendarPrimitive
                      mode="single"
                      selected={currentDate}
                      onSelect={handleDateChange}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
          </CardDescription>
          <CardContent className="p-6">
            <div className="overflow-x-auto">
              <BigCalendar
                localizer={localizer}
                events={reservations}
                startAccessor="start"
                endAccessor="end"
                defaultView={Views.WEEK}
                views={['week', 'day']}
                messages={messages}
                culture='ja'
                min={new Date(0, 0, 0, 6, 0, 0)}
                max={new Date(0, 0, 0, 23, 0, 0)}
                date={currentDate}
                formats={{
                  timeGutterFormat: (date, culture, localizer) => {
                    if (!localizer) return '';
                    return localizer.format(date, 'HH:mm', culture);
                  },
                }}
                components={{
                  timeGutterHeader: () => <div style={{ height: '100%', display: 'flex', alignItems: 'flex-end', paddingRight: '8px' }}>時間</div>,
                }}
                className="rbc-calendar-fullscreen"
              />
            </div>
          </CardContent>
        </Card>
      </div>
      <style jsx global>{`
        .rbc-time-header {
          min-width: 300px;
        }
        .rbc-time-content {
          min-width: 300px;
        }
        .rbc-time-gutter {
          position: sticky;
          left: 0;
          background-color: white;
          z-index: 1;
        }
        .rbc-timeslot-group {
          min-width: 100px;
        }
        .rbc-events-container {
          min-width: 100px;
        }
      `}</style>
    </div>
  )
}