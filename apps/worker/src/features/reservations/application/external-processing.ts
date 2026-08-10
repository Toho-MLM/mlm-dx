import {
  determineHallReservationState,
  getJSTDateString,
  getJSTDayRange,
  subtractOccupiedIntervals,
  type ReservationProcessResult,
  type StoredTimeInterval,
  type TimeInterval,
} from '../domain/time';
import type { Clock } from './processing';

export type ProcessableExternalReservation = {
  id: string;
  external_studio_id: string;
  room_number: number;
  user_id: string;
  group_id: string | null;
  start_time: string;
  end_time: string;
};

export interface ExternalReservationProcessingRepository {
  listConfirmedOverlaps(input: {
    studioId: string;
    roomNumber: number;
    startTime: string;
    endTime: string;
    excludeId?: string | number;
  }): Promise<StoredTimeInterval[]>;
  listPending(startTime: string, endTime: string): Promise<ProcessableExternalReservation[]>;
  applyResult(reservationId: string, result: ReservationProcessResult, updatedAt: string): Promise<void>;
  completePast(before: string, updatedAt: string): Promise<number>;
  deleteExpiredStudios(before: string): Promise<number>;
}

export interface ExternalReservationProcessingEffects {
  broadcastReservationsChanged(): Promise<void>;
  sendExternalNotification(input: {
    reservationId: string;
    notificationType: 'RESERVATION_ADJUSTED' | 'RESERVATION_CONFIRMED' | 'RESERVATION_DECLINED';
    requestedStartTime?: string;
    requestedEndTime?: string;
  }): Promise<void>;
}

export function createExternalReservationProcessingService(deps: {
  repository: ExternalReservationProcessingRepository;
  effects: ExternalReservationProcessingEffects;
  clock?: Clock;
}) {
  const clock = deps.clock ?? { now: () => new Date() };

  async function getAvailableIntervals(input: {
    studioId: string;
    roomNumber: number;
    startTime: string;
    endTime: string;
    reservationId: string | number;
  }): Promise<TimeInterval[]> {
    const occupied = await deps.repository.listConfirmedOverlaps({
      studioId: input.studioId,
      roomNumber: input.roomNumber,
      startTime: input.startTime,
      endTime: input.endTime,
      excludeId: input.reservationId,
    });
    return subtractOccupiedIntervals(input.startTime, input.endTime, occupied);
  }

  async function determineState(input: {
    studioId: string;
    roomNumber: number;
    reservationId: string | number;
    startTime: string;
    endTime: string;
  }): Promise<ReservationProcessResult> {
    const occupied = await deps.repository.listConfirmedOverlaps({
      studioId: input.studioId,
      roomNumber: input.roomNumber,
      startTime: input.startTime,
      endTime: input.endTime,
      excludeId: input.reservationId,
    });
    return determineHallReservationState(input.startTime, input.endTime, occupied, clock.now());
  }

  async function processToday(): Promise<number> {
    const range = getJSTDayRange(getJSTDateString(clock.now()));
    const pending = await deps.repository.listPending(range.startUTC.toISOString(), range.endUTC.toISOString());
    let changedCount = 0;
    for (const reservation of pending) {
      const result = await determineState({
        studioId: reservation.external_studio_id,
        roomNumber: reservation.room_number,
        reservationId: reservation.id,
        startTime: reservation.start_time,
        endTime: reservation.end_time,
      });
      if (result.state === 'PENDING') continue;
      await deps.repository.applyResult(reservation.id, result, clock.now().toISOString());
      changedCount += 1;
      await deps.effects.sendExternalNotification({
        reservationId: reservation.id,
        notificationType: result.adjustedStartTime && result.adjustedEndTime
          ? 'RESERVATION_ADJUSTED'
          : result.state === 'CONFIRMED'
            ? 'RESERVATION_CONFIRMED'
            : 'RESERVATION_DECLINED',
        requestedStartTime: result.adjustedStartTime ? reservation.start_time : undefined,
        requestedEndTime: result.adjustedEndTime ? reservation.end_time : undefined,
      });
    }
    if (changedCount > 0) await deps.effects.broadcastReservationsChanged();
    return changedCount;
  }

  async function processPast(): Promise<number> {
    const now = clock.now();
    const range = getJSTDayRange(getJSTDateString(now));
    const count = await deps.repository.completePast(range.startUTC.toISOString(), now.toISOString());
    if (count > 0) await deps.effects.broadcastReservationsChanged();
    return count;
  }

  async function deleteExpired(): Promise<number> {
    const count = await deps.repository.deleteExpiredStudios(clock.now().toISOString());
    if (count > 0) await deps.effects.broadcastReservationsChanged();
    return count;
  }

  return { getAvailableIntervals, determineState, processToday, processPast, deleteExpired };
}
