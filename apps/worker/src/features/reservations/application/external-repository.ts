import type { LotteryTargetType, ReservationState } from '@shared-schemas';

export type ExternalStudioRecord = {
  id: string;
  target_type: LotteryTargetType;
  start_datetime: string;
  end_datetime: string;
  draw_datetime: string | null;
  room_names: string;
  created_at: string;
  updated_at: string;
};

export type ExternalReservationRecord = {
  id: string;
  external_studio_id: string;
  room_number: number;
  user_id: string;
  group_id: string | null;
  start_time: string;
  end_time: string;
  state: ReservationState;
  updated_at: string;
};

export type ExternalLotteryApplicationRecord = {
  user_id: string;
  group_id: string | null;
  state: string;
};

export type MemberConflictRow = {
  reservation_id: string;
  reservation_type: 'HALL' | 'EXTERNAL';
  reservation_name: string | null;
  location_name: string;
  start_time: string;
  end_time: string;
  member_id: string;
};

export interface ExternalReservationRepository {
  listStudios(): Promise<ExternalStudioRecord[]>;
  findStudio(id: string): Promise<ExternalStudioRecord | null>;
  createStudio(input: { id: string; targetType: LotteryTargetType; startTime: string; endTime: string; drawTime: string | null; roomNames: string[]; createdAt: string }): Promise<boolean>;
  hasHallTargetOverlap(startTime: string, endTime: string, excludeId?: string): Promise<boolean>;
  closeLotteryApplications(studioId: string, updatedAt: string): Promise<void>;
  listRevocableReservationIds(studioId: string, targetType: LotteryTargetType): Promise<string[]>;
  deleteStudioCascade(studioId: string, targetType: LotteryTargetType, updatedAt: string): Promise<void>;
  hasRoomConflict(input: { studioId: string; roomNumber: number; startTime: string; endTime: string; excludeId?: string }): Promise<boolean>;
  listMemberConflictRows(input: { memberIds: string[]; startTime: string; endTime: string; excludeId?: string }): Promise<MemberConflictRow[]>;
  listVisibleReservations(userId: string, admin: boolean): Promise<Record<string, unknown>[]>;
  createReservationIfAvailable(input: {
    id: string; studioId: string; roomNumber: number; userId: string; groupId: string | null;
    startTime: string; endTime: string; createdAt: string;
  }): Promise<boolean>;
  findReservation(id: string): Promise<ExternalReservationRecord | null>;
  existsReservation(id: string): Promise<boolean>;
  deleteReservation(id: string): Promise<void>;
  updateReservationOptimistically(input: {
    id: string; previous: ExternalReservationRecord; startTime: string; endTime: string; updatedAt: string;
  }): Promise<boolean>;
  restoreReservation(input: {
    id: string; previous: ExternalReservationRecord; currentStartTime: string; currentEndTime: string;
    currentUpdatedAt: string; restoredAt: string;
  }): Promise<void>;
  updateStatusOptimistically(input: {
    reservation: ExternalReservationRecord; nextState: ReservationState; updatedAt: string;
  }): Promise<boolean>;
  updateState(id: string, state: ReservationState, updatedAt: string): Promise<void>;
  listLotteryApplications(): Promise<Record<string, unknown>[]>;
  hasLotteryOverlap(input: { userId: string; groupId: string | null; rangeStart: string; rangeEnd: string }): Promise<boolean>;
  createLotteryApplicationIfAvailable(input: {
    id: string; studioId: string; userId: string; groupId: string | null;
    preferredStart: string | null; preferredEnd: string | null; requestedMinutes: number;
    rangeStart: string; rangeEnd: string; createdAt: string;
  }): Promise<boolean>;
  findLotteryApplication(id: string): Promise<ExternalLotteryApplicationRecord | null>;
  cancelPendingLotteryApplication(id: string, updatedAt: string): Promise<boolean>;
  deleteLotteryApplication(id: string): Promise<void>;
}
