import type { Bindings } from '../index';
import { createExternalReservationProcessingService } from '../features/reservations/application/external-processing';
import { createD1ExternalReservationProcessingRepository } from '../features/reservations/infrastructure/d1-external-processing-repository';
import type { AvailableInterval, ProcessResult } from './reservation-processor';
import { broadcastReservationRealtimeEvent } from './reservation-realtime';
import { prepareAndSendReservationEmail } from './reservation-email';

function createService(env: Bindings) {
  return createExternalReservationProcessingService({
    repository: createD1ExternalReservationProcessingRepository(env.DB),
    effects: {
      broadcastReservationsChanged: () => broadcastReservationRealtimeEvent(env, 'reservations_changed'),
      sendExternalNotification: (input) => prepareAndSendReservationEmail(env, {
        kind: 'EXTERNAL',
        ...input,
      }),
    },
  });
}

export async function getAvailableExternalIntervals(
  env: Bindings,
  externalStudioId: string,
  roomNumber: number,
  startTime: string,
  endTime: string,
  reservationId: string | number
): Promise<AvailableInterval[]> {
  return createService(env).getAvailableIntervals({
    studioId: externalStudioId,
    roomNumber,
    startTime,
    endTime,
    reservationId,
  });
}

export async function processExternalReservationState(
  env: Bindings,
  externalStudioId: string,
  roomNumber: number,
  reservationId: string | number,
  startTime: string,
  endTime: string
): Promise<ProcessResult> {
  return createService(env).determineState({
    studioId: externalStudioId,
    roomNumber,
    reservationId,
    startTime,
    endTime,
  });
}

export async function processTodayExternalReservations(env: Bindings): Promise<number> {
  return createService(env).processToday();
}

export async function processPastExternalReservations(env: Bindings): Promise<number> {
  return createService(env).processPast();
}

export async function deleteExpiredExternals(env: Bindings): Promise<number> {
  return createService(env).deleteExpired();
}
