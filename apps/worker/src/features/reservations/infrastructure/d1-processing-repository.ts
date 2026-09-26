import type { D1Database } from '@cloudflare/workers-types';
import type {
  ProcessableReservation,
  ReservationProcessingRepository,
} from '../application/processing';
import type { ReservationProcessResult, StoredTimeInterval } from '../domain/time';

export function createD1ReservationProcessingRepository(db: D1Database): ReservationProcessingRepository {
  async function isStillPending(reservation: ProcessableReservation): Promise<boolean> {
    const current = await db.prepare(`
      SELECT state, start_time, end_time, updated_at FROM reservations WHERE id = ?
    `).bind(reservation.id).first<Pick<ProcessableReservation, 'state' | 'start_time' | 'end_time' | 'updated_at'>>();
    return current?.state === 'PENDING'
      && current.start_time === reservation.start_time
      && current.end_time === reservation.end_time
      && current.updated_at === reservation.updated_at;
  }
  return {
    async listConfirmedHallOverlaps(startTime, endTime, excludeId) {
      const hasExclude = excludeId !== undefined && excludeId !== '' && excludeId !== 0;
      const rows = await db.prepare(`
        SELECT start_time, end_time
        FROM reservations
        WHERE state = 'CONFIRMED'
          AND start_time < ?
          AND end_time > ?
          ${hasExclude ? 'AND id != ?' : ''}
        ORDER BY start_time ASC
      `).bind(endTime, startTime, ...(hasExclude ? [excludeId] : [])).all<StoredTimeInterval>();
      return rows.results ?? [];
    },

    async listDueHallReservations(endTime) {
      const rows = await db.prepare(`
        SELECT id, start_time, end_time, state, updated_at
        FROM reservations
        WHERE state = 'PENDING'
          AND start_time <= ?
        ORDER BY start_time ASC
      `).bind(endTime).all<ProcessableReservation>();
      return rows.results ?? [];
    },

    async applyHallProcessResult(reservation, result, updatedAt) {
      if (result.adjustedStartTime && result.adjustedEndTime) {
        const update = await db.prepare(`
          UPDATE reservations
          SET state = ?, start_time = ?, end_time = ?, updated_at = ?
           WHERE id = ? AND state = 'PENDING' AND start_time = ? AND end_time = ? AND updated_at = ?
            AND NOT EXISTS (
              SELECT 1 FROM reservations other
              WHERE other.id != ? AND other.state = 'CONFIRMED'
                AND other.start_time < ? AND other.end_time > ?
            )
        `).bind(
          result.state,
          result.adjustedStartTime,
          result.adjustedEndTime,
          updatedAt,
          reservation.id,
          reservation.start_time,
          reservation.end_time,
          reservation.updated_at,
          reservation.id,
          result.adjustedEndTime,
          result.adjustedStartTime
        ).run();
        if (Number(update.meta.changes ?? 0) > 0) return 'UPDATED';
        return await isStillPending(reservation) ? 'CONFLICT' : 'STALE';
      }

      const update = await db.prepare(`
        UPDATE reservations
        SET state = ?, updated_at = ?
         WHERE id = ? AND state = 'PENDING' AND start_time = ? AND end_time = ? AND updated_at = ?
          AND (
            ? != 'CONFIRMED'
            OR NOT EXISTS (
              SELECT 1 FROM reservations other
              WHERE other.id != ? AND other.state = 'CONFIRMED'
                AND other.start_time < ? AND other.end_time > ?
            )
          )
      `).bind(
        result.state,
        updatedAt,
        reservation.id,
        reservation.start_time,
        reservation.end_time,
        reservation.updated_at,
        result.state,
        reservation.id,
        reservation.end_time,
        reservation.start_time
      ).run();
      if (Number(update.meta.changes ?? 0) > 0) return 'UPDATED';
      return await isStillPending(reservation) ? 'CONFLICT' : 'STALE';
    },

    async declineHallReservation(reservation, updatedAt) {
      const result = await db.prepare(`
        UPDATE reservations SET state = 'DECLINED', updated_at = ?
        WHERE id = ? AND state = 'PENDING' AND start_time = ? AND end_time = ? AND updated_at = ?
      `).bind(updatedAt, reservation.id, reservation.start_time, reservation.end_time, reservation.updated_at).run();
      return Number(result.meta.changes ?? 0) > 0;
    },

    async completePastHallReservations(before, updatedAt) {
      const count = await db.prepare(`
        SELECT COUNT(*) AS count
        FROM reservations
        WHERE state = 'CONFIRMED' AND end_time < ?
      `).bind(before).first<{ count: number }>();
      await db.prepare(`
        UPDATE reservations
        SET state = 'COMPLETED', updated_at = ?
        WHERE state = 'CONFIRMED' AND end_time < ?
      `).bind(updatedAt, before).run();
      return Number(count?.count ?? 0);
    },

    async deleteHallReservationsBefore(before) {
      await db.prepare("DELETE FROM reservations WHERE end_time < ? AND state != 'PENDING'").bind(before).run();
    },
  };
}

export type { ReservationProcessResult };
