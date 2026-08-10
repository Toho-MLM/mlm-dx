import type { ReservationState } from '@shared-schemas';

export type HallReservationRecord = {
  user_id: string;
  group_id: string | null;
  start_time: string;
  end_time: string;
  state: ReservationState;
  updated_at: string;
};

export type AffectedHallReservation = Pick<HallReservationRecord, 'start_time' | 'end_time'> & { id: string };

export type UnavailableAdjustment = {
  reservationId: string;
  startTime?: string;
  endTime?: string;
  decline: boolean;
};

export interface HallReservationRepository {
  listVisibleReservations(input: { userId: string; admin: boolean; since: string }): Promise<Record<string, unknown>[]>;
  hasUnavailableOverlap(startTime: string, endTime: string): Promise<boolean>;
  createReservation(input: {
    id: string; userId: string; groupId: string | null; startTime: string; endTime: string; createdAt: string;
  }): Promise<void>;
  findReservation(id: string): Promise<HallReservationRecord | null>;
  existsReservation(id: string): Promise<boolean>;
  deleteReservation(id: string): Promise<void>;
  hasConfirmedConflict(id: string, startTime: string, endTime: string): Promise<boolean>;
  updateReservationOptimistically(input: {
    id: string;
    previous: HallReservationRecord;
    startTime: string;
    endTime: string;
    state: string;
    updatedAt: string;
  }): Promise<boolean>;
  restoreReservation(input: {
    id: string;
    previous: HallReservationRecord;
    currentStartTime: string;
    currentEndTime: string;
    currentState: string;
    currentUpdatedAt: string;
    restoredAt: string;
  }): Promise<void>;
  updateStatusOptimistically(input: {
    id: string;
    previousState: ReservationState;
    previousUpdatedAt: string;
    nextState: ReservationState;
    startTime: string;
    endTime: string;
    updatedAt: string;
  }): Promise<boolean>;
  updateState(id: string, state: ReservationState, updatedAt: string): Promise<void>;
  listUnavailablePeriods(): Promise<Record<string, unknown>[]>;
  listAffectedReservations(startTime: string, endTime: string): Promise<AffectedHallReservation[]>;
  createUnavailablePeriodWithAdjustments(input: {
    id: string;
    startTime: string;
    endTime: string;
    reason: string | null;
    createdAt: string;
    adjustments: UnavailableAdjustment[];
  }): Promise<void>;
  existsUnavailablePeriod(id: string): Promise<boolean>;
  deleteUnavailablePeriod(id: string): Promise<void>;
}
