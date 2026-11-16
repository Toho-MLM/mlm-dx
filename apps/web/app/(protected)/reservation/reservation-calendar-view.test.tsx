import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Calendar, Navigate, Views, type View } from 'react-big-calendar'
import { describe, expect, it } from 'vitest'
import { reservationLocalizer, ThreeDayView } from './reservation-calendar-view'

// Use the real CommonJS dependency: mocking TimeGrid hides React error #130.
const views = { week: true, myRange: ThreeDayView, day: true }
const date = new Date(2026, 10, 16)

function renderCalendar(view: View, currentDate = date) {
  return renderToStaticMarkup(
    <Calendar
      localizer={reservationLocalizer}
      culture="ja"
      date={currentDate}
      view={view}
      views={views}
      events={[{
        title: '回帰テスト予約',
        start: new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate(), 12),
        end: new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate(), 13),
      }]}
      onNavigate={() => {}}
      onView={() => {}}
    />
  )
}

describe('予約カレンダーの描画', () => {
  it.each([
    ['スマホの3日表示', 'myRange' as View, 3],
    ['1日表示', Views.DAY, 1],
    ['週表示', Views.WEEK, 7],
  ])('%sで日付列と予約を描画できる', (_name, view, columns) => {
    const html = renderCalendar(view)
    expect(html.match(/role="columnheader"/g)).toHaveLength(columns)
    expect(html).toContain('回帰テスト予約')
  })

  it('月をまたいで3日ずつ前後に移動して描画できる', () => {
    const lastDay = new Date(2026, 10, 30)
    const next = ThreeDayView.navigate(lastDay, Navigate.NEXT)
    expect(next).toEqual(new Date(2026, 11, 3))
    expect(renderCalendar('myRange' as View, next)).toContain('3日間表示: 12/03 - 12/05')
    const previous = ThreeDayView.navigate(next, Navigate.PREVIOUS)
    expect(previous).toEqual(lastDay)
    expect(renderCalendar('myRange' as View, previous)).toContain('3日間表示: 11/30 - 12/02')
  })
})
