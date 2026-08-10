import type { D1Database } from '@cloudflare/workers-types';
import type {
  ProcessableReservation,
  ReservationProcessingRepository,
} from '../application/processing';
import type { ReservationProcessResult, StoredTimeInterval } from '../domain/time';

export function createD1ReservationProcessingRepository(db: D1Database): ReservationProcessingRepository {
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

    async listPendingHallReservations(startTime, endTime) {
      const rows = await db.prepare(`
        SELECT id, start_time, end_time, state
        FROM reservations
        WHERE state = 'PENDING'
          AND start_time >= ?
          AND start_time <= ?
        ORDER BY start_time ASC
      `).bind(startTime, endTime).all<ProcessableReservation>();
      return rows.results ?? [];
    },

    async applyHallProcessResult(reservation, result, updatedAt) {
      if (result.adjustedStartTime && result.adjustedEndTime) {
        const update = await db.prepare(`
          UPDATE reservations
          SET state = ?, start_time = ?, end_time = ?, updated_at = ?
          WHERE id = ?
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
          reservation.id,
          result.adjustedEndTime,
          result.adjustedStartTime
        ).run();
        return Number(update.meta.changes ?? 0) > 0 ? 'UPDATED' : 'CONFLICT';
      }

      const update = await db.prepare(`
        UPDATE reservations
        SET state = ?, updated_at = ?
        WHERE id = ?
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
        result.state,
        reservation.id,
        reservation.end_time,
        reservation.start_time
      ).run();
      return Number(update.meta.changes ?? 0) > 0 ? 'UPDATED' : 'CONFLICT';
    },

    async declineHallReservation(id, updatedAt) {
      await db.prepare("UPDATE reservations SET state = 'DECLINED', updated_at = ? WHERE id = ?")
        .bind(updatedAt, id).run();
    },

    async completePastHallReservations(before, updatedAt) {
      const count = await db.prepare(`
        SELECT COUNT(*) AS count
        FROM reservations
        WHERE state IN ('CONFIRMED', 'PENDING') AND end_time < ?
      `).bind(before).first<{ count: number }>();
      await db.prepare(`
        UPDATE reservations
        SET state = 'COMPLETED', updated_at = ?
        WHERE state IN ('CONFIRMED', 'PENDING') AND end_time < ?
      `).bind(updatedAt, before).run();
      return Number(count?.count ?? 0);
    },

    async deleteHallReservationsBefore(before) {
      await db.prepare('DELETE FROM reservations WHERE end_time < ?').bind(before).run();
    },
  };
}

export type { ReservationProcessResult };
