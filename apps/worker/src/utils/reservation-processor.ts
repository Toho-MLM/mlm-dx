import type { Bindings } from '../index';
import { createReservationProcessingService } from '../features/reservations/application/processing';
import { createD1ReservationProcessingRepository } from '../features/reservations/infrastructure/d1-processing-repository';
import {
  getJSTDateString,
  getJSTDayRange,
  getJSTTimeRange,
  isTodayInJST,
  selectLongestInterval,
  subtractOccupiedIntervals,
  validateReservationDateRange,
  type ReservationProcessResult,
  type TimeInterval,
} from '../features/reservations/domain/time';
import { broadcastReservationRealtimeEvent } from './reservation-realtime';
import { prepareAndSendReservationEmail } from './reservation-email';

export type ProcessResult = ReservationProcessResult;
export type AvailableInterval = TimeInterval;
export {
  getJSTDateString,
  getJSTDayRange,
  getJSTTimeRange,
  isTodayInJST,
  selectLongestInterval,
  validateReservationDateRange,
};

function createService(env: Bindings) {
  return createReservationProcessingService({
    repository: createD1ReservationProcessingRepository(env.DB),
    effects: {
      broadcastReservationsChanged: () => broadcastReservationRealtimeEvent(env, 'reservations_changed'),
      sendHallNotification: (input) => prepareAndSendReservationEmail(env, {
        kind: 'HALL',
        ...input,
      }),
    },
  });
}

export async function getAvailableIntervals(
  env: Bindings,
  startTime: string,
  endTime: string,
  reservationId: number | string
): Promise<AvailableInterval[]> {
  const repository = createD1ReservationProcessingRepository(env.DB);
  const occupied = await repository.listConfirmedHallOverlaps(startTime, endTime, reservationId);
  return subtractOccupiedIntervals(startTime, endTime, occupied);
}

export async function processReservationState(
  env: Bindings,
  reservationId: number | string,
  startTime: string,
  endTime: string
): Promise<ProcessResult> {
  return createService(env).determineState(reservationId, startTime, endTime);
}

export async function processTodayReservations(env: Bindings): Promise<number> {
  return createService(env).processToday();
}

export async function processPastReservations(env: Bindings): Promise<number> {
  return createService(env).processPast();
}

export async function deleteOldReservations(env: Bindings): Promise<void> {
  return createService(env).deleteOld();
}
