'use client'

import React, { useState } from 'react'
import { Calendar as BigCalendar, dateFnsLocalizer, Views } from 'react-big-calendar'
import { Calendar as CalendarPrimitive } from "@/components/ui/calendar"
import { format, parse, startOfWeek, getDay, addDays, addMinutes, addHours, subMonths, addMonths, isBefore, setHours, setMinutes, startOfDay } from 'date-fns'
import { ja as jaLocale } from 'date-fns/locale'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ScrollArea } from "@/components/ui/scroll-area"
import { CalendarIcon, PlusCircleIcon, XCircleIcon, ChevronLeftIcon, ChevronRightIcon, AlertCircle, Loader2 } from 'lucide-react'
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
import { ReservationData, ReservationHolder } from '../types'
import { supabase } from '@/supabase/supabaseClient'

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
  day: '日',
  previous: '前',
  next: '次',
  today: '今日',
  agenda: 'リスト',
  showMore: (total: number) => `+${total} 件`,
}

export function ReservationPage({reservationData}: {reservationData: ReservationData[]}) {
  const [reservationDraft, setReservationDraft] = useState({
    reservationName: '',
    date: new Date(),
    startHour: null as number | null,
    startMinute: null as number | null,
    endHour: null as number | null,
    endMinute: null as number | null,
  })
  const [isReservationFormOpen, setIsReservationFormOpen] = useState(false)
  const [selectedReservation, setSelectedReservation] = useState<ReservationData | null>(null)
  const [openPicker, setOpenPicker] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [currentDate, setCurrentDate] = useState(new Date())
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [reservationHolders, setReservationHolders] = useState<ReservationHolder[]>([{name: '個人', id: null}])

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

  const handleSubmit = async () => {
    if (
      !reservationDraft.reservationName ||
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
      const { data, error } = await supabase.rpc('create_reservations', {
        p_group: null,
        p_start_time: start,
        p_end_time: end,
        p_notes: null,
      });
      if (error) {
        setErrorMessage('データの送信中にエラーが発生しました。' + error.message);
      } else if (data === null) {
        setErrorMessage('データの受信中にエラーが発生しました。');
      } else if ('error' in data) {
        setErrorMessage('データの処理中にエラーが発生しました。' + data.error);
      } else {

      }
    } catch (err) {
      setErrorMessage((err as Error).message);
    } finally {
      setIsSending(false);
    }
  }

  const handleCancel = (id: number) => {
    // TODO: 予約の削除
    setSelectedReservation(null)
  }

  const handleSelectEvent = (event: ReservationData) => {
    // TODO: 予約の選択
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
                <Dialog open={isReservationFormOpen} onOpenChange={setIsReservationFormOpen}>
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
                          onValueChange={(value) => handleInputChange('reservationName', value === 'none' ? null : value)}
                          value={reservationDraft.reservationName || 'none'}
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
                              <SelectValue/>
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
                              <SelectValue/>
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
                              <SelectValue/>
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
                              <SelectValue/>
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
                        {isSending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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
                          <p><strong>ID: </strong> #{selectedReservation.id}</p>
                          <p><strong>開始:</strong> {format(selectedReservation.start_time, 'yyyy/MM/dd HH:mm', { locale: jaLocale })}</p>
                          <p><strong>終了:</strong> {format(selectedReservation.end_time, 'yyyy/MM/dd HH:mm', { locale: jaLocale })}</p>
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
            <BigCalendar
              localizer={localizer}
              events={reservationData}
              startAccessor={(event) => event.start_time}
              endAccessor={(event) => event.end_time}
              onSelectEvent={handleSelectEvent}
              defaultView={Views.WEEK}
              views={['week', 'agenda']}
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
            />
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