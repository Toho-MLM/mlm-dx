import { describe, expect, it } from 'vitest';
import {
  enumerateStarts,
  getApplicationRange,
  getFairShareMinutes,
  getMemberSchedulingImpact,
  hasMemberConflict,
  parseRoomNames,
  subtractRoomReservations,
} from './external-lottery';

describe('external lottery domain', () => {
  it('部屋名JSONを検証する', () => {
    expect(parseRoomNames('["A","B"]')).toEqual(['A', 'B']);
    expect(() => parseRoomNames('["A",""]')).toThrow('INVALID_EXTERNAL_ROOM_NAMES');
  });

  it('既存予約を部屋の空き枠から差し引く', () => {
    const result = subtractRoomReservations(
      new Date('2026-08-11T00:00:00.000Z'),
      new Date('2026-08-11T02:00:00.000Z'),
      [{ start_time: '2026-08-11T00:30:00.000Z', end_time: '2026-08-11T01:00:00.000Z' }]
    );
    expect(result.map((item) => [item.start.toISOString(), item.end.toISOString()])).toEqual([
      ['2026-08-11T00:00:00.000Z', '2026-08-11T00:30:00.000Z'],
      ['2026-08-11T01:00:00.000Z', '2026-08-11T02:00:00.000Z'],
    ]);
  });

  it('希望範囲をスタジオ内に制限する', () => {
    expect(getApplicationRange(
      { preferred_start_datetime: null, preferred_end_datetime: null, requested_duration_minutes: 60 },
      { start_datetime: '2026-08-11T00:00:00.000Z', end_datetime: '2026-08-11T03:00:00.000Z' },
      new Date('2026-08-11T00:00:00.000Z'),
      new Date('2026-08-12T00:00:00.000Z')
    )).toEqual({
      rangeStart: new Date('2026-08-11T00:00:00.000Z'),
      rangeEnd: new Date('2026-08-11T03:00:00.000Z'),
      requestedMinutes: 60,
    });
  });

  it('共有メンバーの時間競合を検出する', () => {
    expect(hasMemberConflict(
      ['member-a'],
      new Date('2026-08-11T00:30:00.000Z'),
      new Date('2026-08-11T01:30:00.000Z'),
      [{
        memberIds: new Set(['member-a']),
        start: new Date('2026-08-11T01:00:00.000Z'),
        end: new Date('2026-08-11T02:00:00.000Z'),
      }]
    )).toBe(true);
  });

  it('開始候補を5分単位で列挙し、公平配分を10分単位にする', () => {
    const interval = { start: new Date('2026-08-11T00:02:00.000Z'), end: new Date('2026-08-11T02:00:00.000Z') };
    expect(enumerateStarts(interval, 30, new Date('2026-08-12T00:00:00.000Z'))[0].toISOString())
      .toBe('2026-08-11T00:05:00.000Z');
    const application = {
      memberIds: ['member-a'],
      rangeStart: new Date('2026-08-11T00:00:00.000Z'),
      rangeEnd: new Date('2026-08-11T02:00:00.000Z'),
      requestedMinutes: 120,
    };
    expect(getFairShareMinutes(application, [application, { ...application, memberIds: ['member-b'] }], [{
      roomNumber: 1,
      intervals: [{ start: application.rangeStart, end: application.rangeEnd }],
      longestMinutes: 120,
    }])).toBe(60);
  });

  it('割当によって共有メンバーの候補が失われる度合いを返す', () => {
    const base = {
      memberIds: ['member-a'],
      rangeStart: new Date('2026-08-11T00:00:00.000Z'),
      rangeEnd: new Date('2026-08-11T00:30:00.000Z'),
      requestedMinutes: 30,
    };
    expect(getMemberSchedulingImpact(
      base,
      base.rangeStart,
      base.rangeEnd,
      [base]
    )).toEqual({ madeUnschedulable: 1, lostOptions: 1 });
  });
});
