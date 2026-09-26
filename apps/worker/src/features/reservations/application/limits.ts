import { ReservationLimitRemainingSchema } from '@shared-schemas';
import {
  calculateOverlapMinutes,
  getReferenceDayRange,
  getRollingConflictWindows,
  getRollingWindow,
  type StoredTimeInterval,
} from '../domain/time';

export type ReservationLimitScope = 'PERSONAL' | 'GROUP';
export type ReservationLimitType = 'FIXED' | 'ROLLING';
export type ReservationKind = 'HALL' | 'EXTERNAL' | 'LOTTERY';

export type ReservationLimitRecord = {
  id: string;
  scope: ReservationLimitScope;
  limit_type: ReservationLimitType;
  start_datetime: string | null;
  end_datetime: string | null;
  window_days: number | null;
  max_minutes: number;
};

export type UsageQuery = {
  scope: ReservationLimitScope;
  targetId: string;
  rangeStartTime: string;
  rangeEndTime: string;
  exclude?: { kind: ReservationKind; id: string };
};

export interface ReservationLimitRepository {
  listLimits(scope?: ReservationLimitScope): Promise<ReservationLimitRecord[]>;
  listUsageIntervals(query: UsageQuery): Promise<StoredTimeInterval[]>;
  hasOverlappingFixedLimit(
    scope: ReservationLimitScope,
    startDatetime: string,
    endDatetime: string,
    excludeId?: string
  ): Promise<boolean>;
  hasRollingLimit(scope: ReservationLimitScope, excludeId?: string): Promise<boolean>;
  existsLimit(id: string): Promise<boolean>;
  createLimit(limit: ReservationLimitRecord, createdAt: string): Promise<void>;
  updateLimit(limit: ReservationLimitRecord, updatedAt: string): Promise<void>;
  deleteLimit(id: string): Promise<void>;
}

export function createReservationLimitService(repository: ReservationLimitRepository) {
  async function getUsedMinutes(query: UsageQuery): Promise<number> {
    const intervals = await repository.listUsageIntervals(query);
    return intervals.reduce((total, interval) => total + calculateOverlapMinutes(
      interval.start_time,
      interval.end_time,
      query.rangeStartTime,
      query.rangeEndTime
    ), 0);
  }

  type ConflictInput = {
    userId: string;
    groupId: string | null;
    startTime: string;
    endTime: string;
    exclude?: { kind: ReservationKind; id: string };
  };

  async function prepareConflictChecker(input: ConflictInput): Promise<(startTime: string, endTime: string) => boolean> {
    const scope: ReservationLimitScope = input.groupId ? 'GROUP' : 'PERSONAL';
    const targetId = input.groupId ?? input.userId;
    const limits = await repository.listLimits(scope);
    const applicable = limits.filter((limit) => {
      if (limit.limit_type === 'FIXED') {
        return limit.start_datetime && limit.end_datetime
          && calculateOverlapMinutes(input.startTime, input.endTime, limit.start_datetime, limit.end_datetime) > 0;
      }
      return Boolean(limit.window_days);
    });
    if (applicable.length === 0) return () => false;

    const ranges = applicable.map((limit) => {
      if (limit.limit_type === 'FIXED') {
        return { start: new Date(limit.start_datetime!).getTime(), end: new Date(limit.end_datetime!).getTime() };
      }
      const duration = Number(limit.window_days) * 24 * 60 * 60 * 1000;
      return {
        start: new Date(input.startTime).getTime() - duration,
        end: new Date(input.endTime).getTime() + duration,
      };
    });
    const usage = await repository.listUsageIntervals({
      scope, targetId,
      rangeStartTime: new Date(Math.min(...ranges.map((range) => range.start))).toISOString(),
      rangeEndTime: new Date(Math.max(...ranges.map((range) => range.end))).toISOString(),
      exclude: input.exclude,
    });

    return (startTime, endTime) => applicable.some((limit) => {
      if (limit.limit_type === 'FIXED') {
        const requested = calculateOverlapMinutes(
          startTime, endTime, limit.start_datetime!, limit.end_datetime!
        );
        if (requested === 0) return false;
        const used = usage.reduce((total, interval) => total + calculateOverlapMinutes(
          interval.start_time, interval.end_time, limit.start_datetime!, limit.end_datetime!
        ), 0);
        return used + requested > Number(limit.max_minutes);
      }
      const windows = getRollingConflictWindows(startTime, endTime, Number(limit.window_days), usage);
      return windows.some((window) => {
        const requested = calculateOverlapMinutes(startTime, endTime, window.startTime, window.endTime);
        if (requested === 0) return false;
        const used = usage.reduce((total, interval) => total + calculateOverlapMinutes(
          interval.start_time, interval.end_time, window.startTime, window.endTime
        ), 0);
        return used + requested > Number(limit.max_minutes);
      });
    });
  }

  async function hasConflict(input: ConflictInput): Promise<boolean> {
    const check = await prepareConflictChecker(input);
    return check(input.startTime, input.endTime);
  }

  async function getRemaining(input: {
    scope: ReservationLimitScope;
    targetId: string;
    referenceTime: string;
  }) {
    const referenceDay = getReferenceDayRange(input.referenceTime);
    const limits = await repository.listLimits(input.scope);
    const remaining = [];

    for (const limit of limits) {
      let rangeStartTime: string;
      let rangeEndTime: string;
      if (limit.limit_type === 'FIXED') {
        if (!limit.start_datetime || !limit.end_datetime) continue;
        if (limit.start_datetime >= referenceDay.endTime || limit.end_datetime <= referenceDay.startTime) continue;
        rangeStartTime = limit.start_datetime;
        rangeEndTime = limit.end_datetime;
      } else {
        if (!limit.window_days) continue;
        const window = getRollingWindow(input.referenceTime, Number(limit.window_days));
        rangeStartTime = window.startTime;
        rangeEndTime = window.endTime;
      }

      const usedMinutes = await getUsedMinutes({
        scope: input.scope,
        targetId: input.targetId,
        rangeStartTime,
        rangeEndTime,
      });
      remaining.push(ReservationLimitRemainingSchema.parse({
        ...limit,
        used_minutes: usedMinutes,
        remaining_minutes: Math.max(0, Number(limit.max_minutes) - usedMinutes),
      }));
    }
    return remaining;
  }

  return { getUsedMinutes, hasConflict, prepareConflictChecker, getRemaining };
}
