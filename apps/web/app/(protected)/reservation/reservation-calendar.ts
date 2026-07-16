import { addMinutes, startOfDay } from 'date-fns'

import type { Event, ReservationState } from '../../types'
import {
  isReservationTimeValid,
  type Reservation,
  type UnavailablePeriod,
} from '@shared-schemas'

export const MIN_RESERVATION_MINUTES = 10
export const TIME_STEP_MINUTES = 5

export type ReservationDraft = {
  date: Date
  group: string | null
  startHour: number | null
  startMinute: number | null
  endHour: number | null
  endMinute: number | null
}

export type CalendarEvent = {
  id: string
  title: string
  start: Date
  end: Date
  allDay: boolean
  resource: {
    type: 'reservation' | 'event' | 'unavailable'
    reservationId?: string
    eventId?: string
    periodId?: string
    reason?: string | null
    user_id?: string
    group_id?: string | null
    user_name?: string
    group_name?: string
    state?: ReservationState
    cancellable?: number
  }
}

type Interval = {
  start: Date
  end: Date
}

export function toReservationCalendarEvents(reservations: Reservation[]): CalendarEvent[] {
  return reservations.map((reservation) => ({
    id: reservation.id,
    title: reservation.group_name || reservation.user_name || '予約',
    start: new Date(reservation.start_time),
    end: new Date(reservation.end_time),
    allDay: false,
    resource: {
      type: 'reservation',
      reservationId: reservation.id,
      user_id: reservation.user_id,
      group_id: reservation.group_id,
      user_name: reservation.user_name || undefined,
      group_name: reservation.group_name || undefined,
      state: reservation.state as ReservationState,
      cancellable: reservation.cancellable,
    },
  }))
}

export function toEventCalendarEvents(events: Event[]): CalendarEvent[] {
  return events.map((event) => {
    const start = startOfDay(new Date(event.event_date))
    const end = new Date(start)
    end.setHours(23, 59, 59, 999)

    return {
      id: `event-${event.id}`,
      title: event.title,
      start,
      end,
      allDay: true,
      resource: {
        type: 'event',
        eventId: event.id,
      },
    }
  })
}

export function toUnavailableCalendarEvents(periods: UnavailablePeriod[]): CalendarEvent[] {
  return periods.map((period) => ({
    id: `unavailable-${period.id}`,
    title: `予約不可${period.reason ? `: ${period.reason}` : ''}`,
    start: new Date(period.start_datetime),
    end: new Date(period.end_datetime),
    allDay: false,
    resource: {
      type: 'unavailable',
      periodId: period.id,
      reason: period.reason,
    },
  }))
}

function dateWithTime(date: Date, hour: number, minute: number): Date {
  const result = new Date(date)
  result.setHours(hour, minute, 0, 0)
  return result
}

function roundToTimeStep(date: Date, direction: 'up' | 'down'): Date {
  const result = new Date(date)
  result.setSeconds(0, 0)
  const remainder = result.getMinutes() % TIME_STEP_MINUTES

  if (remainder !== 0) {
    result.setMinutes(
      result.getMinutes() + (direction === 'up' ? TIME_STEP_MINUTES - remainder : -remainder)
    )
  }

  return result
}

function clearDraftTime(draft: ReservationDraft): ReservationDraft {
  return {
    ...draft,
    startHour: null,
    startMinute: null,
    endHour: null,
    endMinute: null,
  }
}

function getUnavailableIntervals(
  periods: CalendarEvent[],
  rangeStart: Date,
  rangeEnd: Date
): Interval[] {
  return periods
    .filter((period) => period.start < rangeEnd && period.end > rangeStart)
    .map((period) => ({
      start: new Date(Math.max(period.start.getTime(), rangeStart.getTime())),
      end: new Date(Math.min(period.end.getTime(), rangeEnd.getTime())),
    }))
    .sort((a, b) => a.start.getTime() - b.start.getTime())
}

function selectLongestAvailableInterval(
  desiredStart: Date,
  desiredEnd: Date,
  unavailablePeriods: CalendarEvent[],
  now: Date
): Interval | null {
  const latestEnd = dateWithTime(desiredStart, 23, 0)
  let rangeStart = new Date(desiredStart)
  let rangeEnd = new Date(Math.min(desiredEnd.getTime(), latestEnd.getTime()))

  if (startOfDay(rangeStart).getTime() === startOfDay(now).getTime() && rangeStart < now) {
    rangeStart = roundToTimeStep(now, 'up')
  }

  rangeStart = roundToTimeStep(rangeStart, 'up')
  rangeEnd = roundToTimeStep(rangeEnd, 'down')

  if (rangeEnd.getTime() - rangeStart.getTime() < MIN_RESERVATION_MINUTES * 60 * 1000) {
    return null
  }

  const available = getUnavailableIntervals(unavailablePeriods, rangeStart, rangeEnd).reduce<Interval[]>(
    (intervals, blocked) => intervals.flatMap((interval) => {
      if (blocked.end <= interval.start || blocked.start >= interval.end) return [interval]

      return [
        blocked.start > interval.start ? { start: interval.start, end: blocked.start } : null,
        blocked.end < interval.end ? { start: blocked.end, end: interval.end } : null,
      ].filter((item): item is Interval => item !== null)
    }),
    [{ start: rangeStart, end: rangeEnd }]
  )

  return available
    .map((interval) => ({
      start: roundToTimeStep(interval.start, 'up'),
      end: roundToTimeStep(interval.end, 'down'),
    }))
    .filter((interval) => interval.end.getTime() - interval.start.getTime() >= MIN_RESERVATION_MINUTES * 60 * 1000)
    .reduce<Interval | null>((longest, interval) => {
      if (!longest) return interval
      const longestDuration = longest.end.getTime() - longest.start.getTime()
      const intervalDuration = interval.end.getTime() - interval.start.getTime()
      return intervalDuration > longestDuration ? interval : longest
    }, null)
}

export function adjustReservationDraftForDate(
  draft: ReservationDraft,
  date: Date,
  unavailablePeriods: CalendarEvent[],
  isAdminMode: boolean,
  now = new Date()
): ReservationDraft {
  const nextDraft = { ...draft, date }

  if (
    draft.startHour !== null &&
    draft.startMinute !== null &&
    draft.endHour !== null &&
    draft.endMinute !== null
  ) {
    const desiredStart = dateWithTime(date, draft.startHour, draft.startMinute)
    const desiredEnd = dateWithTime(date, draft.endHour, draft.endMinute)
    const adjusted = selectLongestAvailableInterval(
      desiredStart,
      desiredEnd,
      isAdminMode ? [] : unavailablePeriods,
      now
    )

    return adjusted
      ? {
          ...nextDraft,
          startHour: adjusted.start.getHours(),
          startMinute: adjusted.start.getMinutes(),
          endHour: adjusted.end.getHours(),
          endMinute: adjusted.end.getMinutes(),
        }
      : clearDraftTime(nextDraft)
  }

  if (draft.startHour !== null && draft.startMinute !== null) {
    const desiredStart = dateWithTime(date, draft.startHour, draft.startMinute)
    const latestEndTime = dateWithTime(date, 23, 0)
    if (
      !isReservationTimeValid(date, draft.startHour, draft.startMinute) ||
      addMinutes(desiredStart, MIN_RESERVATION_MINUTES) > latestEndTime
    ) {
      return clearDraftTime(nextDraft)
    }
  }

  return nextDraft
}
