import type { D1Database } from '@cloudflare/workers-types';
import type {
  ExistingExternalReservation,
  ExistingRoomReservation,
  ExternalLotteryRepository,
  LotteryApplicationRecord,
  LotteryStudioRecord,
  ReservationIdentityRecord,
} from '../application/external-lottery-repository';

export function createD1ExternalLotteryRepository(db: D1Database): ExternalLotteryRepository {
  return {
    async listExistingReservationIdentities(rangeStart, rangeEnd) {
      const [hall, external] = await Promise.all([
        db.prepare(`
          SELECT user_id, group_id, start_time, end_time FROM reservations
          WHERE state IN ('PENDING', 'CONFIRMED') AND start_time < ? AND end_time > ?
        `).bind(rangeEnd, rangeStart).all<ReservationIdentityRecord>(),
        db.prepare(`
          SELECT user_id, group_id, start_time, end_time FROM external_reservations
          WHERE state = 'CONFIRMED' AND start_time < ? AND end_time > ?
        `).bind(rangeEnd, rangeStart).all<ReservationIdentityRecord>(),
      ]);
      return [...(hall.results ?? []), ...(external.results ?? [])];
    },

    async getFairnessUsageMinutes(userId, groupId, rangeStart, rangeEnd) {
      const row = await db.prepare(`
        SELECT COALESCE(ROUND(SUM((julianday(end_time) - julianday(start_time)) * 1440)), 0) AS minutes
        FROM external_reservations
        WHERE ((? IS NULL AND group_id IS NULL AND user_id = ?) OR group_id = ?)
          AND state IN ('CONFIRMED', 'CANCELLED', 'COMPLETED', 'WITHDRAWN')
          AND start_time >= ? AND start_time < ?
      `).bind(groupId, userId, groupId, rangeStart, rangeEnd).first<{ minutes: number }>();
      return Number(row?.minutes ?? 0);
    },

    async markLost(applicationId, score, updatedAt) {
      await db.prepare(`
        UPDATE external_lottery_applications SET state = 'LOST', fairness_score = ?, updated_at = ?
        WHERE id = ? AND state = 'PENDING'
      `).bind(score, updatedAt, applicationId).run();
    },

    async listStudios(rangeStart, rangeEnd) {
      const rows = await db.prepare(`
        SELECT id, start_datetime, end_datetime, room_names FROM external_studios
        WHERE start_datetime < ? AND end_datetime > ? ORDER BY start_datetime ASC, id ASC
      `).bind(rangeEnd, rangeStart).all<LotteryStudioRecord>();
      return rows.results ?? [];
    },

    async listPendingApplications(studio, rangeStart, rangeEnd) {
      const rows = await db.prepare(`
        SELECT id, external_studio_id, user_id, group_id,
               preferred_start_datetime, preferred_end_datetime, requested_duration_minutes, created_at
        FROM external_lottery_applications
        WHERE external_studio_id = ? AND state = 'PENDING'
          AND COALESCE(preferred_start_datetime, ?) >= ?
          AND COALESCE(preferred_start_datetime, ?) < ?
        ORDER BY created_at ASC, id ASC
      `).bind(
        studio.id, studio.start_datetime, rangeStart, studio.start_datetime, rangeEnd
      ).all<LotteryApplicationRecord>();
      return rows.results ?? [];
    },

    async findCreatedReservation(id) {
      const row = await db.prepare(`
        SELECT id, user_id, group_id, room_number, start_time, end_time
        FROM external_reservations WHERE id = ?
      `).bind(id).first<ExistingExternalReservation>();
      return row ? { ...row, room_number: Number(row.room_number) } : null;
    },

    async recoverWon(input) {
      const r = input.reservation;
      const result = await db.prepare(`
        UPDATE external_lottery_applications
        SET state = 'WON', fairness_score = ?, assigned_room_number = ?,
            assigned_start_datetime = ?, assigned_end_datetime = ?, updated_at = ?
        WHERE id = ? AND state = 'PENDING'
      `).bind(
        input.score, r.room_number, r.start_time, r.end_time, input.updatedAt, input.applicationId
      ).run();
      return Number(result.meta.changes ?? 0) > 0;
    },

    async listConfirmedRoomReservations(studioId, rangeStart, rangeEnd) {
      const rows = await db.prepare(`
        SELECT room_number, start_time, end_time FROM external_reservations
        WHERE external_studio_id = ? AND state = 'CONFIRMED' AND start_time < ? AND end_time > ?
      `).bind(studioId, rangeEnd, rangeStart).all<ExistingRoomReservation>();
      return (rows.results ?? []).map((row) => ({ ...row, room_number: Number(row.room_number) }));
    },

    async allocateWon(input) {
      const [insert] = await db.batch([
        db.prepare(`
          INSERT INTO external_reservations
            (id, external_studio_id, room_number, user_id, group_id, start_time, end_time, state, created_at, updated_at)
          SELECT ?, ?, ?, ?, ?, ?, ?, 'CONFIRMED', ?, ?
          WHERE EXISTS (SELECT 1 FROM external_lottery_applications WHERE id = ? AND state = 'PENDING')
        `).bind(
          input.application.id, input.studioId, input.roomNumber,
          input.application.user_id, input.application.group_id,
          input.startTime, input.endTime, input.updatedAt, input.updatedAt, input.application.id
        ),
        db.prepare(`
          UPDATE external_lottery_applications
          SET state = 'WON', fairness_score = ?, assigned_room_number = ?,
              assigned_start_datetime = ?, assigned_end_datetime = ?, updated_at = ?
          WHERE id = ? AND state = 'PENDING'
        `).bind(
          input.score, input.roomNumber, input.startTime, input.endTime, input.updatedAt, input.application.id
        ),
      ]);
      return Number(insert.meta.changes ?? 0) > 0;
    },
  };
}
