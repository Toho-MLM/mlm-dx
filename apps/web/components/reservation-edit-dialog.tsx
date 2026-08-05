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

function roundUpToFiveMinutes(value: Date): Date {
  const rounded = new Date(value)
  rounded.setSeconds(0, 0)
  const remainder = rounded.getMinutes() % 5
  rounded.setMinutes(rounded.getMinutes() + (remainder === 0 ? 5 : 5 - remainder))
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
  const minDate = allowCrossDay && rangeStartParts ? rangeStartParts.date : today
  const maxDate = allowCrossDay && rangeEndParts ? rangeEndParts.date : addJstDays(today, 14)
  const earliestEndTime = started ? getJstParts(roundUpToFiveMinutes(new Date())).time : '06:10'
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
          <div className={allowCrossDay ? 'grid grid-cols-1 gap-4 sm:grid-cols-2' : undefined}>
            <div className="space-y-2">
              <Label htmlFor="edit-reservation-date">{allowCrossDay ? '開始日' : '予約日'}</Label>
              <Input
                id="edit-reservation-date"
                type="date"
                value={date}
                min={minDate}
                max={maxDate}
                readOnly={started}
                aria-readonly={started}
                onChange={(event) => {
                  const nextDate = event.target.value
                  setDate(nextDate)
                  if (allowCrossDay && endDate < nextDate) setEndDate(nextDate)
                }}
              />
            </div>
            {allowCrossDay && (
              <div className="space-y-2">
                <Label htmlFor="edit-reservation-end-date">終了日</Label>
                <Input
                  id="edit-reservation-end-date"
                  type="date"
                  value={endDate}
                  min={date || minDate}
                  max={maxDate}
                  onChange={(event) => setEndDate(event.target.value)}
                />
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="edit-reservation-start">開始時刻</Label>
              <Input
                id="edit-reservation-start"
                type="time"
                min={startTimeMin}
                max={startTimeMax}
                step={300}
                value={startTime}
                readOnly={started}
                aria-readonly={started}
                onChange={(event) => setStartTime(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-reservation-end">終了時刻</Label>
              <Input
                id="edit-reservation-end"
                type="time"
                min={endTimeMin}
                max={endTimeMax}
                step={300}
                value={endTime}
                onChange={(event) => setEndTime(event.target.value)}
              />
            </div>
          </div>
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
