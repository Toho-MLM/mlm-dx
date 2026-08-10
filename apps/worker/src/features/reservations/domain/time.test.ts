import { describe, expect, it } from 'vitest';
import {
  calculateOverlapMinutes,
  determineHallReservationState,
  getJSTDateString,
  getRemainingIntervalAfterUnavailablePeriod,
  getRollingWindow,
  subtractOccupiedIntervals,
  validateReservationDateRange,
} from './time';

describe('reservation time domain', () => {
  it('UTCの日付境界をJSTの日付へ変換する', () => {
    expect(getJSTDateString(new Date('2026-08-10T15:00:00.000Z'))).toBe('2026-08-11');
  });

  it('予約可能日はJSTの今日から14日後までとする', () => {
    const now = new Date('2026-08-10T15:30:00.000Z');
    expect(validateReservationDateRange(new Date('2026-08-10T15:00:00.000Z'), now)).toEqual({ isValid: true });
    expect(validateReservationDateRange(new Date('2026-08-09T14:59:59.000Z'), now)).toEqual({
      isValid: false,
      error: 'RESERVATION_DATE_IN_PAST',
    });
    expect(validateReservationDateRange(new Date('2026-08-25T15:00:00.000Z'), now)).toEqual({
      isValid: false,
      error: 'RESERVATION_DATE_TOO_FAR',
    });
  });

  it('占有時間を差し引いて空き時間を返す', () => {
    const available = subtractOccupiedIntervals(
      '2026-08-11T00:00:00.000Z',
      '2026-08-11T03:00:00.000Z',
      [{ start_time: '2026-08-11T01:00:00.000Z', end_time: '2026-08-11T02:00:00.000Z' }]
    );
    expect(available.map((item) => [item.start.toISOString(), item.end.toISOString()])).toEqual([
      ['2026-08-11T00:00:00.000Z', '2026-08-11T01:00:00.000Z'],
      ['2026-08-11T02:00:00.000Z', '2026-08-11T03:00:00.000Z'],
    ]);
  });

  it('当日の競合がなければ確定し、最長枠だけ空いていれば調整する', () => {
    const now = new Date('2026-08-10T15:30:00.000Z');
    expect(determineHallReservationState(
      '2026-08-10T21:00:00.000Z',
      '2026-08-10T23:00:00.000Z',
      [],
      now
    )).toEqual({ state: 'CONFIRMED' });
    expect(determineHallReservationState(
      '2026-08-10T21:00:00.000Z',
      '2026-08-11T00:00:00.000Z',
      [{ start_time: '2026-08-10T22:00:00.000Z', end_time: '2026-08-10T23:00:00.000Z' }],
      now
    )).toEqual({
      state: 'CONFIRMED',
      adjustedStartTime: '2026-08-10T21:00:00.000Z',
      adjustedEndTime: '2026-08-10T22:00:00.000Z',
    });
  });

  it('利用不可期間の前後から長い方を選び、10分未満は破棄する', () => {
    expect(getRemainingIntervalAfterUnavailablePeriod(
      '2026-08-11T00:00:00.000Z',
      '2026-08-11T02:00:00.000Z',
      '2026-08-11T00:30:00.000Z',
      '2026-08-11T00:45:00.000Z'
    )).toEqual({ startTime: '2026-08-11T00:45:00.000Z', endTime: '2026-08-11T02:00:00.000Z' });
    expect(getRemainingIntervalAfterUnavailablePeriod(
      '2026-08-11T00:00:00.000Z',
      '2026-08-11T00:09:00.000Z',
      '2026-08-11T00:01:00.000Z',
      '2026-08-11T00:08:00.000Z'
    )).toBeNull();
  });

  it('重複分数とrolling期間を計算する', () => {
    expect(calculateOverlapMinutes(
      '2026-08-11T00:00:00.000Z',
      '2026-08-11T02:00:00.000Z',
      '2026-08-11T01:15:00.000Z',
      '2026-08-11T03:00:00.000Z'
    )).toBe(45);
    expect(getRollingWindow('2026-08-11T12:00:00.000Z', 7)).toEqual({
      startTime: '2026-08-04T12:00:00.000Z',
      endTime: '2026-08-11T12:00:00.000Z',
    });
  });
});
