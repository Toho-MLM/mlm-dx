'use client'

import { useEffect, useMemo, useState, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LoadingButton } from '@/components/ui/loading-button'
import { toast } from 'sonner'

type JstParts = {
  date: string
  time: string
}

function getJstParts(value: Date): JstParts {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value)
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ''

  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}`,
  }
}

function addJstDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00+09:00`)
  value.setUTCDate(value.getUTCDate() + days)
  return getJstParts(value).date
}

function roundUpToNextMinute(value: Date): Date {
  const rounded = new Date(value)
  const hadPartialMinute = rounded.getSeconds() > 0 || rounded.getMilliseconds() > 0
  rounded.setSeconds(0, 0)
  if (hadPartialMinute) rounded.setMinutes(rounded.getMinutes() + 1)
  return rounded
}

type ReservationEditDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  start: Date
  end: Date
  isSaving: boolean
  onSave: (startTime: string, endTime: string) => Promise<void>
  title?: string
  allowCrossDay?: boolean
  rangeStart?: Date
  rangeEnd?: Date
}

export function ReservationEditDialog({
  open,
  onOpenChange,
  start,
  end,
  isSaving,
  onSave,
  title = '予約を変更',
  allowCrossDay = false,
  rangeStart,
  rangeEnd,
}: ReservationEditDialogProps) {
  const started = Date.now() >= start.getTime()
  const initialStart = useMemo(() => getJstParts(start), [start])
  const initialEnd = useMemo(() => getJstParts(end), [end])
  const [date, setDate] = useState(initialStart.date)
  const [endDate, setEndDate] = useState(initialEnd.date)
  const [startTime, setStartTime] = useState(initialStart.time)
  const [endTime, setEndTime] = useState(initialEnd.time)

  useEffect(() => {
    if (!open) return
    setDate(initialStart.date)
    setEndDate(initialEnd.date)
    setStartTime(initialStart.time)
    setEndTime(initialEnd.time)
  }, [initialEnd.date, initialEnd.time, initialStart.date, initialStart.time, open])

  const today = getJstParts(new Date()).date
  const rangeStartParts = rangeStart ? getJstParts(rangeStart) : null
  const rangeEndParts = rangeEnd ? getJstParts(rangeEnd) : null
  const rangeStartValue = rangeStartParts ? `${rangeStartParts.date}T${rangeStartParts.time}` : undefined
  const rangeEndValue = rangeEndParts ? `${rangeEndParts.date}T${rangeEndParts.time}` : undefined
  const minDate = allowCrossDay && rangeStartParts ? rangeStartParts.date : today
  const maxDate = allowCrossDay && rangeEndParts ? rangeEndParts.date : addJstDays(today, 14)
  const earliestEndTime = started ? getJstParts(roundUpToNextMinute(new Date())).time : '06:10'
  const selectedStart = new Date(`${date}T${startTime}:00+09:00`)
  const fourHoursAfterStart = Number.isNaN(selectedStart.getTime())
    ? { date, time: '23:00' }
    : getJstParts(new Date(selectedStart.getTime() + 4 * 60 * 60 * 1000))
  const latestEndTime = fourHoursAfterStart.date === date && fourHoursAfterStart.time < '23:00'
    ? fourHoursAfterStart.time
    : '23:00'
  const startTimeMin = allowCrossDay
    ? (date === rangeStartParts?.date ? rangeStartParts.time : undefined)
    : '06:00'
  const startTimeMax = allowCrossDay
    ? (date === rangeEndParts?.date ? rangeEndParts.time : undefined)
    : '22:50'
  const endTimeMin = allowCrossDay
    ? (endDate === rangeStartParts?.date ? rangeStartParts.time : undefined)
    : earliestEndTime
  const endTimeMax = allowCrossDay
    ? (endDate === rangeEndParts?.date ? rangeEndParts.time : undefined)
    : latestEndTime
  const startDateTime = `${date}T${startTime}`
  const endDateTime = `${endDate}T${endTime}`
  const tenMinutesAfterStart = Number.isNaN(selectedStart.getTime())
    ? undefined
    : getJstParts(new Date(selectedStart.getTime() + 10 * 60 * 1000))
  const minimumCrossDayEnd = started
    ? getJstParts(roundUpToNextMinute(new Date()))
    : tenMinutesAfterStart
  const minimumCrossDayEndValue = minimumCrossDayEnd
    ? `${minimumCrossDayEnd.date}T${minimumCrossDayEnd.time}`
    : startDateTime
  const maximumCrossDayEndValue = [
    `${fourHoursAfterStart.date}T${fourHoursAfterStart.time}`,
    rangeEndValue,
  ].filter((value): value is string => Boolean(value)).sort()[0]

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const nextStart = new Date(`${date}T${startTime}:00+09:00`)
    const nextEnd = new Date(`${allowCrossDay ? endDate : date}T${endTime}:00+09:00`)
    if (Number.isNaN(nextStart.getTime()) || Number.isNaN(nextEnd.getTime())) {
      toast.error('日時を正しく入力してください')
      return
    }
    if (nextEnd <= new Date()) {
      toast.error('終了時刻は現在時刻より後にしてください')
      return
    }
    const durationMinutes = (nextEnd.getTime() - nextStart.getTime()) / 60_000
    if (durationMinutes < 10 || durationMinutes > 240) {
      toast.error('予約時間は10分以上4時間以内にしてください')
      return
    }
    if ((rangeStart && nextStart < rangeStart) || (rangeEnd && nextEnd > rangeEnd)) {
      toast.error('外部スタジオの時間枠内で指定してください')
      return
    }
    await onSave(nextStart.toISOString(), nextEnd.toISOString())
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {started
              ? `開始済みの予約は終了${allowCrossDay ? '日時' : '時刻'}のみ変更できます。`
              : allowCrossDay
                ? '開始日時と終了日時を変更できます。'
                : '予約日、開始時刻、終了時刻を変更できます。'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {allowCrossDay ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edit-reservation-start-datetime">開始日時</Label>
                <Input
                  id="edit-reservation-start-datetime"
                  type="datetime-local"
                  min={rangeStartValue}
                  max={rangeEndValue}
                  step={60}
                  value={startDateTime}
                  readOnly={started}
                  aria-readonly={started}
                  onChange={(event) => {
                    const [nextDate, nextTime] = event.target.value.split('T')
                    setDate(nextDate)
                    setStartTime(nextTime)
                  }}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-reservation-end-datetime">終了日時</Label>
                <Input
                  id="edit-reservation-end-datetime"
                  type="datetime-local"
                  min={minimumCrossDayEndValue}
                  max={maximumCrossDayEndValue}
                  step={60}
                  value={endDateTime}
                  onChange={(event) => {
                    const [nextDate, nextTime] = event.target.value.split('T')
                    setEndDate(nextDate)
                    setEndTime(nextTime)
                  }}
                  required
                />
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="edit-reservation-date">予約日</Label>
                <Input
                  id="edit-reservation-date"
                  type="date"
                  value={date}
                  min={minDate}
                  max={maxDate}
                  readOnly={started}
                  aria-readonly={started}
                  onChange={(event) => setDate(event.target.value)}
                  required
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="edit-reservation-start">開始時刻</Label>
                  <Input
                    id="edit-reservation-start"
                    type="time"
                    min={startTimeMin}
                    max={startTimeMax}
                    step={60}
                    value={startTime}
                    readOnly={started}
                    aria-readonly={started}
                    onChange={(event) => setStartTime(event.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-reservation-end">終了時刻</Label>
                  <Input
                    id="edit-reservation-end"
                    type="time"
                    min={endTimeMin}
                    max={endTimeMax}
                    step={60}
                    value={endTime}
                    onChange={(event) => setEndTime(event.target.value)}
                    required
                  />
                </div>
              </div>
            </>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              戻る
            </Button>
            <LoadingButton type="submit" isLoading={isSaving}>
              変更
            </LoadingButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
