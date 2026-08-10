import type { D1Database } from '@cloudflare/workers-types';
import type {
  ExternalReservationProcessingRepository,
  ProcessableExternalReservation,
} from '../application/external-processing';
import type { StoredTimeInterval } from '../domain/time';

export function createD1ExternalReservationProcessingRepository(
  db: D1Database
): ExternalReservationProcessingRepository {
  return {
    async listConfirmedOverlaps(input) {
      const hasExclude = input.excludeId !== undefined && input.excludeId !== '' && input.excludeId !== 0;
      const rows = await db.prepare(`
        SELECT start_time, end_time
        FROM external_reservations
        WHERE external_studio_id = ? AND room_number = ? AND state = 'CONFIRMED'
          AND start_time < ? AND end_time > ?
          ${hasExclude ? 'AND id != ?' : ''}
        ORDER BY start_time ASC
      `).bind(
        input.studioId,
        input.roomNumber,
        input.endTime,
        input.startTime,
        ...(hasExclude ? [input.excludeId] : [])
      ).all<StoredTimeInterval>();
      return rows.results ?? [];
    },

    async listPending(startTime, endTime) {
      const rows = await db.prepare(`
        SELECT id, external_studio_id, room_number, user_id, group_id, start_time, end_time
        FROM external_reservations
        WHERE state = 'PENDING' AND start_time >= ? AND start_time <= ?
        ORDER BY start_time ASC
      `).bind(startTime, endTime).all<ProcessableExternalReservation>();
      return (rows.results ?? []).map((row) => ({ ...row, room_number: Number(row.room_number) }));
    },

    async applyResult(reservationId, result, updatedAt) {
      if (result.adjustedStartTime && result.adjustedEndTime) {
        await db.prepare(`
          UPDATE external_reservations
          SET state = ?, start_time = ?, end_time = ?, updated_at = ? WHERE id = ?
        `).bind(result.state, result.adjustedStartTime, result.adjustedEndTime, updatedAt, reservationId).run();
        return;
      }
      await db.prepare('UPDATE external_reservations SET state = ?, updated_at = ? WHERE id = ?')
        .bind(result.state, updatedAt, reservationId).run();
    },

    async completePast(before, updatedAt) {
      const count = await db.prepare(`
        SELECT COUNT(*) AS count FROM external_reservations
        WHERE state IN ('CONFIRMED', 'PENDING') AND end_time < ?
      `).bind(before).first<{ count: number }>();
      await db.prepare(`
        UPDATE external_reservations SET state = 'COMPLETED', updated_at = ?
        WHERE state IN ('CONFIRMED', 'PENDING') AND end_time < ?
      `).bind(updatedAt, before).run();
      return Number(count?.count ?? 0);
    },

    async deleteExpiredStudios(before) {
      const expired = await db.prepare('SELECT id FROM external_studios WHERE end_datetime < ?')
        .bind(before).all<{ id: string }>();
      const ids = (expired.results ?? []).map((row) => row.id);
      for (const id of ids) {
        await db.batch([
          db.prepare('DELETE FROM external_lottery_applications WHERE external_studio_id = ?').bind(id),
          db.prepare('DELETE FROM external_reservations WHERE external_studio_id = ?').bind(id),
          db.prepare('DELETE FROM external_studios WHERE id = ?').bind(id),
        ]);
      }
      return ids.length;
    },
  };
}
