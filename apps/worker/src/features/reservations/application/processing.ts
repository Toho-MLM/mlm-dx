import {
  determineHallReservationState,
  getJSTDateString,
  getJSTDayRange,
  type ReservationProcessResult,
  type StoredTimeInterval,
} from '../domain/time';

export type ProcessableReservation = {
  id: string | number;
  start_time: string;
  end_time: string;
  state: string;
};

export interface ReservationProcessingRepository {
  listConfirmedHallOverlaps(startTime: string, endTime: string, excludeId?: string | number): Promise<StoredTimeInterval[]>;
  listPendingHallReservations(startTime: string, endTime: string): Promise<ProcessableReservation[]>;
  applyHallProcessResult(
    reservation: ProcessableReservation,
    result: ReservationProcessResult,
    updatedAt: string
  ): Promise<'UPDATED' | 'CONFLICT'>;
  declineHallReservation(id: string | number, updatedAt: string): Promise<void>;
  completePastHallReservations(before: string, updatedAt: string): Promise<number>;
  deleteHallReservationsBefore(before: string): Promise<void>;
}

export interface ReservationProcessingEffects {
  broadcastReservationsChanged(): Promise<void>;
  sendHallNotification(input: {
    reservationId: string;
    notificationType: 'RESERVATION_ADJUSTED' | 'RESERVATION_CONFIRMED' | 'RESERVATION_DECLINED';
    requestedStartTime?: string;
    requestedEndTime?: string;
  }): Promise<void>;
}

export type Clock = { now(): Date };

export function createReservationProcessingService(deps: {
  repository: ReservationProcessingRepository;
  effects: ReservationProcessingEffects;
  clock?: Clock;
}) {
  const clock = deps.clock ?? { now: () => new Date() };

  async function determineState(
    reservationId: string | number,
    startTime: string,
    endTime: string
  ): Promise<ReservationProcessResult> {
    const occupied = await deps.repository.listConfirmedHallOverlaps(startTime, endTime, reservationId);
    return determineHallReservationState(startTime, endTime, occupied, clock.now());
  }

  async function processToday(): Promise<number> {
    const now = clock.now();
    const range = getJSTDayRange(getJSTDateString(now));
    const pending = await deps.repository.listPendingHallReservations(
      range.startUTC.toISOString(),
      range.endUTC.toISOString()
    );
    let changedCount = 0;

    for (const reservation of pending) {
      try {
        const result = await determineState(reservation.id, reservation.start_time, reservation.end_time);
        if (result.state === 'PENDING') continue;

        const updatedAt = clock.now().toISOString();
        const update = await deps.repository.applyHallProcessResult(reservation, result, updatedAt);
        if (update === 'CONFLICT') {
          await deps.repository.declineHallReservation(reservation.id, updatedAt);
          result.state = 'DECLINED';
          delete result.adjustedStartTime;
          delete result.adjustedEndTime;
        }
        changedCount += 1;
        await deps.effects.sendHallNotification({
          reservationId: String(reservation.id),
          notificationType: result.adjustedStartTime && result.adjustedEndTime
            ? 'RESERVATION_ADJUSTED'
            : result.state === 'CONFIRMED'
              ? 'RESERVATION_CONFIRMED'
              : 'RESERVATION_DECLINED',
          requestedStartTime: result.adjustedStartTime ? reservation.start_time : undefined,
          requestedEndTime: result.adjustedEndTime ? reservation.end_time : undefined,
        });
      } catch (error) {
        console.error(`Error processing reservation ${reservation.id}:`, error);
      }
    }

    if (changedCount > 0) await deps.effects.broadcastReservationsChanged();
    return changedCount;
  }

  async function processPast(): Promise<number> {
    const now = clock.now();
    const range = getJSTDayRange(getJSTDateString(now));
    const changedCount = await deps.repository.completePastHallReservations(
      range.startUTC.toISOString(),
      now.toISOString()
    );
    if (changedCount > 0) await deps.effects.broadcastReservationsChanged();
    return changedCount;
  }

  async function deleteOld(): Promise<void> {
    const now = clock.now();
    now.setUTCHours(15, 0, 0, 0);
    const cutoff = new Date(now);
    cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 1);
    await deps.repository.deleteHallReservationsBefore(cutoff.toISOString());
  }

  return { determineState, processToday, processPast, deleteOld };
}
