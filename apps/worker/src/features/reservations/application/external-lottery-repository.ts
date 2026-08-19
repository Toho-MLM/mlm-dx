export type LotteryStudioRecord = {
  id: string;
  target_type: 'HALL' | 'EXTERNAL';
  start_datetime: string;
  end_datetime: string;
  draw_datetime: string | null;
  room_names: string;
};

export type LotteryApplicationRecord = {
  id: string;
  external_studio_id: string;
  user_id: string;
  group_id: string | null;
  preferred_start_datetime: string | null;
  preferred_end_datetime: string | null;
  requested_duration_minutes: number | null;
  created_at: string;
};

export type ReservationIdentityRecord = {
  user_id: string;
  group_id: string | null;
  start_time: string;
  end_time: string;
};

export type ExistingExternalReservation = ReservationIdentityRecord & {
  id: string;
  room_number: number;
};

export type ExistingRoomReservation = {
  room_number: number;
  start_time: string;
  end_time: string;
};

export interface ExternalLotteryRepository {
  listExistingReservationIdentities(rangeStart: string, rangeEnd: string): Promise<ReservationIdentityRecord[]>;
  getFairnessUsageMinutes(targetType: 'HALL' | 'EXTERNAL', userId: string, groupId: string | null, rangeStart: string, rangeEnd: string): Promise<number>;
  markLost(applicationId: string, score: number | null, updatedAt: string): Promise<void>;
  listStudios(rangeStart: string, rangeEnd: string): Promise<LotteryStudioRecord[]>;
  listDueHallStudios(drawBefore: string): Promise<LotteryStudioRecord[]>;
  listPendingApplications(studio: LotteryStudioRecord, rangeStart: string, rangeEnd: string): Promise<LotteryApplicationRecord[]>;
  findCreatedReservation(targetType: 'HALL' | 'EXTERNAL', id: string): Promise<ExistingExternalReservation | null>;
  recoverWon(input: { applicationId: string; score: number; reservation: ExistingExternalReservation; updatedAt: string }): Promise<boolean>;
  listConfirmedRoomReservations(studioId: string, rangeStart: string, rangeEnd: string): Promise<ExistingRoomReservation[]>;
  listHallOccupiedIntervals(rangeStart: string, rangeEnd: string): Promise<ExistingRoomReservation[]>;
  allocateWon(input: {
    application: LotteryApplicationRecord;
    studioId: string;
    roomNumber: number;
    startTime: string;
    endTime: string;
    score: number;
    updatedAt: string;
  }): Promise<boolean>;
  allocateHallWon(input: {
    application: LotteryApplicationRecord;
    startTime: string;
    endTime: string;
    score: number;
    updatedAt: string;
  }): Promise<'WON' | 'LOST' | 'UNCHANGED'>;
}
