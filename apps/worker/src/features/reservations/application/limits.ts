import { ReservationLimitRemainingSchema } from '@shared-schemas';
import {
  calculateOverlapMinutes,
  getReferenceDayRange,
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

  async function hasConflict(input: {
    userId: string;
    groupId: string | null;
    startTime: string;
    endTime: string;
    exclude?: { kind: ReservationKind; id: string };
  }): Promise<boolean> {
    const scope: ReservationLimitScope = input.groupId ? 'GROUP' : 'PERSONAL';
    const targetId = input.groupId ?? input.userId;
    const limits = await repository.listLimits(scope);
    const requestedMinutes = calculateOverlapMinutes(
      input.startTime,
      input.endTime,
      input.startTime,
      input.endTime
    );

    for (const limit of limits) {
      let rangeStartTime: string;
      let rangeEndTime: string;
      let minutesInRange = requestedMinutes;

      if (limit.limit_type === 'FIXED') {
        if (!limit.start_datetime || !limit.end_datetime) continue;
        rangeStartTime = limit.start_datetime;
        rangeEndTime = limit.end_datetime;
        minutesInRange = calculateOverlapMinutes(
          input.startTime,
          input.endTime,
          rangeStartTime,
          rangeEndTime
        );
      } else {
        if (!limit.window_days) continue;
        const window = getRollingWindow(input.startTime, Number(limit.window_days));
        rangeStartTime = window.startTime;
        rangeEndTime = window.endTime;
      }

      if (minutesInRange === 0) continue;
      const usedMinutes = await getUsedMinutes({
        scope,
        targetId,
        rangeStartTime,
        rangeEndTime,
        exclude: input.exclude,
      });
      if (usedMinutes + minutesInRange > Number(limit.max_minutes)) return true;
    }
    return false;
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

  return { getUsedMinutes, hasConflict, getRemaining };
}
