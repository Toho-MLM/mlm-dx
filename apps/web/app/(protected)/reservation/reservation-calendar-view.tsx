'use client'

import React, { useMemo } from 'react'
import { dateFnsLocalizer, Navigate, type DateLocalizer } from 'react-big-calendar'
import TimeGridModule from 'react-big-calendar/lib/TimeGrid'
import { format, parse, startOfWeek, getDay, addDays, startOfDay } from 'date-fns'
import { ja as jaLocale } from 'date-fns/locale'

// The CommonJS deep import can retain its default wrapper in Vite builds.
const TimeGrid = typeof TimeGridModule === 'function'
  ? TimeGridModule
  : (TimeGridModule as unknown as { default: typeof TimeGridModule }).default

const locales = {
  'ja': jaLocale,
}

export const reservationLocalizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
})

export function ThreeDayView({
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
