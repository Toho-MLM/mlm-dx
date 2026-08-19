import {
  EXTERNAL_LOTTERY_MIN_DURATION_MINUTES,
} from '@shared-schemas';
import { getJSTDateString, type TimeInterval } from './time';

export type LotteryStudio = {
  start_datetime: string;
  end_datetime: string;
};

export type LotteryApplication = {
  preferred_start_datetime: string | null;
  preferred_end_datetime: string | null;
  requested_duration_minutes: number | null;
};

export type PreparedLotteryApplication = {
  memberIds: string[];
  rangeStart: Date;
  rangeEnd: Date;
  requestedMinutes: number;
};

export type ExistingRoomReservation = {
  start_time: string;
  end_time: string;
};

export type AllocatedIdentity = {
  memberIds: Set<string>;
  start: Date;
  end: Date;
};

export type RoomOption = {
  roomNumber: number;
  intervals: TimeInterval[];
  longestMinutes: number;
};

export type HallLotteryBookingTarget = {
  draw_datetime: string;
  has_pending_applications: boolean;
};

export function isValidHallLotteryTarget(startValue: string, endValue: string): boolean {
  const start = new Date(startValue);
  const end = new Date(endValue);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return false;
  const date = getJSTDateString(start);
  if (getJSTDateString(new Date(end.getTime() - 1)) !== date) return false;
  const businessStart = new Date(`${date}T06:00:00+09:00`);
  const businessEnd = new Date(`${date}T23:00:00+09:00`);
  return start >= businessStart && end <= businessEnd
    && end.getTime() - start.getTime() >= EXTERNAL_LOTTERY_MIN_DURATION_MINUTES * 60_000;
}

export function isLotteryTargetProtected(drawDatetime: string, now = new Date()): boolean {
  const drawAt = new Date(drawDatetime);
  return !Number.isNaN(drawAt.getTime()) && now < drawAt;
}

export function getHallLotteryBookingState(
  targets: HallLotteryBookingTarget[],
  now = new Date()
): { protected: boolean; afterDraw: boolean } {
  if (targets.length === 0) return { protected: false, afterDraw: false };
  const protectedTarget = targets.some((target) => (
    isLotteryTargetProtected(target.draw_datetime, now) || target.has_pending_applications
  ));
  return protectedTarget
    ? { protected: true, afterDraw: false }
    : { protected: false, afterDraw: true };
}

export function parseRoomNames(value: string): string[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.some((name) => typeof name !== 'string' || name.trim() === '')) {
    throw new Error('INVALID_EXTERNAL_ROOM_NAMES');
  }
  return parsed;
}

export function overlaps(startA: Date, endA: Date, startB: Date, endB: Date): boolean {
  return startA < endB && endA > startB;
}

export function subtractRoomReservations(
  start: Date,
  end: Date,
  reservations: ExistingRoomReservation[]
): TimeInterval[] {
  const available: TimeInterval[] = [];
  let cursor = new Date(start);
  const sorted = [...reservations].sort((a, b) => a.start_time.localeCompare(b.start_time));
  for (const reservation of sorted) {
    const blockedStart = new Date(Math.max(start.getTime(), new Date(reservation.start_time).getTime()));
    const blockedEnd = new Date(Math.min(end.getTime(), new Date(reservation.end_time).getTime()));
    if (blockedEnd <= cursor || blockedStart >= end) continue;
    if (blockedStart > cursor) available.push({ start: new Date(cursor), end: blockedStart });
    if (blockedEnd > cursor) cursor = blockedEnd;
  }
  if (cursor < end) available.push({ start: cursor, end: new Date(end) });
  return available;
}

export function getApplicationRange(
  application: LotteryApplication,
  studio: LotteryStudio,
  targetStart: Date,
  targetEnd: Date
): { rangeStart: Date; rangeEnd: Date; requestedMinutes: number } | null {
  const studioStart = new Date(studio.start_datetime);
  const studioEnd = new Date(studio.end_datetime);
  const rangeStart = application.preferred_start_datetime
    ? new Date(application.preferred_start_datetime)
    : studioStart;
  const rangeEnd = application.preferred_end_datetime
    ? new Date(application.preferred_end_datetime)
    : studioEnd;
  if (rangeStart < studioStart || rangeEnd > studioEnd || rangeEnd <= rangeStart) return null;
  if (rangeStart < targetStart || rangeStart >= targetEnd) return null;
  return {
    rangeStart,
    rangeEnd,
    requestedMinutes: application.requested_duration_minutes
      ?? Math.round((rangeEnd.getTime() - rangeStart.getTime()) / 60000),
  };
}

export function hasMemberConflict(
  memberIds: string[],
  start: Date,
  end: Date,
  allocated: AllocatedIdentity[]
): boolean {
  return allocated.some((item) => (
    overlaps(start, end, item.start, item.end)
    && memberIds.some((memberId) => item.memberIds.has(memberId))
  ));
}

function sharesMember(memberIdsA: string[], memberIdsB: string[]): boolean {
  const members = new Set(memberIdsA);
  return memberIdsB.some((memberId) => members.has(memberId));
}

function countTemporalStarts(
  application: PreparedLotteryApplication,
  blockedStart?: Date,
  blockedEnd?: Date
): number {
  const durationMs = EXTERNAL_LOTTERY_MIN_DURATION_MINUTES * 60000;
  const stepMs = 60000;
  const firstStart = Math.ceil(application.rangeStart.getTime() / stepMs) * stepMs;
  const lastStart = application.rangeEnd.getTime() - durationMs;
  let count = 0;
  for (let startMs = firstStart; startMs <= lastStart; startMs += stepMs) {
    const endMs = startMs + durationMs;
    if (blockedStart && blockedEnd && startMs < blockedEnd.getTime() && endMs > blockedStart.getTime()) continue;
    count += 1;
  }
  return count;
}

export function getMemberSchedulingImpact(
  application: PreparedLotteryApplication,
  start: Date,
  end: Date,
  remainingApplications: PreparedLotteryApplication[]
): { madeUnschedulable: number; lostOptions: number } {
  let madeUnschedulable = 0;
  let lostOptions = 0;
  for (const remaining of remainingApplications) {
    if (!sharesMember(application.memberIds, remaining.memberIds)) continue;
    const optionsBefore = countTemporalStarts(remaining);
    if (optionsBefore === 0) continue;
    const optionsAfter = countTemporalStarts(remaining, start, end);
    if (optionsAfter === 0) madeUnschedulable += 1;
    lostOptions += optionsBefore - optionsAfter;
  }
  return { madeUnschedulable, lostOptions };
}

export function enumerateStarts(
  interval: TimeInterval,
  durationMinutes: number,
  latestStartExclusive: Date
): Date[] {
  const step = 60000;
  const first = Math.ceil(interval.start.getTime() / step) * step;
  const latest = Math.min(
    interval.end.getTime() - durationMinutes * 60000,
    latestStartExclusive.getTime() - 1
  );
  const starts: Date[] = [];
  for (let value = first; value <= latest; value += step) starts.push(new Date(value));
  return starts;
}

export function getFairShareMinutes(
  application: PreparedLotteryApplication,
  remainingApplications: PreparedLotteryApplication[],
  roomOptions: RoomOption[]
): number {
  const availableMinutes = roomOptions.reduce((total, room) => total + room.intervals.reduce((roomTotal, interval) => {
    const minutes = Math.floor((interval.end.getTime() - interval.start.getTime()) / 60000);
    return roomTotal + (minutes >= EXTERNAL_LOTTERY_MIN_DURATION_MINUTES ? minutes : 0);
  }, 0), 0);
  const contenders = remainingApplications.filter((remaining) => (
    overlaps(application.rangeStart, application.rangeEnd, remaining.rangeStart, remaining.rangeEnd)
  )).length;
  const possibleWinners = Math.min(
    contenders,
    Math.floor(availableMinutes / EXTERNAL_LOTTERY_MIN_DURATION_MINUTES)
  );
  if (possibleWinners === 0) return 0;
  const fairShare = Math.floor(availableMinutes / possibleWinners);
  return Math.min(application.requestedMinutes, fairShare);
}
