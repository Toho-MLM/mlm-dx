import { describe, expect, it } from 'vitest';
import { CreateExternalLotteryApplicationRequestSchema, CreateExternalRequestSchema } from '@shared-schemas';
import {
  enumerateStarts,
  getApplicationRange,
  getFairShareMinutes,
  getHallLotteryBookingState,
  getMemberSchedulingImpact,
  hasMemberConflict,
  isLotteryTargetProtected,
  isValidHallLotteryTarget,
  parseRoomNames,
  subtractRoomReservations,
} from './external-lottery';

describe('external lottery domain', () => {
  it('既存の抽選対象作成リクエストは外部として扱う', () => {
    const result = CreateExternalRequestSchema.parse({
      names: ['A'],
      start_datetime: '2026-08-14T09:00:00+09:00',
      end_datetime: '2026-08-14T12:00:00+09:00',
    });
    expect(result.target_type).toBe('EXTERNAL');
  });

  it('ホール抽選対象をJSTの同日6:00〜23:00に制限する', () => {
    expect(isValidHallLotteryTarget('2026-08-14T09:00:00+09:00', '2026-08-14T12:00:00+09:00')).toBe(true);
    expect(isValidHallLotteryTarget('2026-08-14T05:59:00+09:00', '2026-08-14T12:00:00+09:00')).toBe(false);
    expect(isValidHallLotteryTarget('2026-08-14T22:45:00+09:00', '2026-08-14T23:15:00+09:00')).toBe(false);
    expect(isValidHallLotteryTarget('2026-08-14T22:45:00+09:00', '2026-08-14T23:00:00+09:00')).toBe(false);
  });

  it('指定した抽選実行日の21:00 JSTを境に通常予約保護を解除する', () => {
    const drawDatetime = '2026-08-10T21:00:00+09:00';
    expect(isLotteryTargetProtected(drawDatetime, new Date('2026-08-10T20:59:59+09:00'))).toBe(true);
    expect(isLotteryTargetProtected(drawDatetime, new Date('2026-08-10T21:00:00+09:00'))).toBe(false);
  });

  it('抽選時刻後もPENDING申込がある間は通常予約を保護する', () => {
    const now = new Date('2026-08-10T21:00:01+09:00');
    const target = { draw_datetime: '2026-08-10T21:00:00+09:00', has_pending_applications: true };
    expect(getHallLotteryBookingState([target], now)).toEqual({ protected: true, afterDraw: false });
    expect(getHallLotteryBookingState([{ ...target, has_pending_applications: false }], now))
      .toEqual({ protected: false, afterDraw: true });
    expect(getHallLotteryBookingState([], now)).toEqual({ protected: false, afterDraw: false });
  });

  it('ホール抽選対象は実行日のみを受け付け、21:00を利用開始前に制限する', () => {
    const base = {
      target_type: 'HALL' as const,
      names: ['ホール'],
      start_datetime: '2026-08-14T09:00:00+09:00',
      end_datetime: '2026-08-14T12:00:00+09:00',
    };
    expect(CreateExternalRequestSchema.safeParse({ ...base, draw_date: '2026-08-10' }).success).toBe(true);
    expect(CreateExternalRequestSchema.safeParse({ ...base, draw_date: '2026-08-14' }).success).toBe(false);
    expect(CreateExternalRequestSchema.safeParse({ ...base, draw_date: '2026-02-30' }).success).toBe(false);
    expect(CreateExternalRequestSchema.safeParse({ ...base, draw_date: '2026-13-01' }).success).toBe(false);
  });

  it('10の倍数でない希望利用時間を受け付ける', () => {
    expect(CreateExternalLotteryApplicationRequestSchema.safeParse({
      external_studio_id: '00000000-0000-4000-8000-000000000000',
      group_id: null,
      preferred_start_datetime: null,
      preferred_end_datetime: null,
      requested_duration_minutes: 31,
    }).success).toBe(true);
  });

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

  it('開始候補と1分単位の公平配分を返す', () => {
    const interval = { start: new Date('2026-08-11T00:02:00.000Z'), end: new Date('2026-08-11T02:00:00.000Z') };
    expect(enumerateStarts(interval, 30, new Date('2026-08-12T00:00:00.000Z'))[0].toISOString())
      .toBe('2026-08-11T00:02:00.000Z');
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
    expect(getFairShareMinutes(application, [application, { ...application, memberIds: ['member-b'] }], [{
      roomNumber: 1,
      intervals: [{ start: application.rangeStart, end: new Date('2026-08-11T02:03:00.000Z') }],
      longestMinutes: 123,
    }])).toBe(61);
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
