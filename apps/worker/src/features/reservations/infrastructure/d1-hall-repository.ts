import type { D1Database } from '@cloudflare/workers-types';
import type { ReservationState } from '@shared-schemas';
import type {
  AffectedHallReservation,
  HallReservationRecord,
  HallReservationRepository,
} from '../application/hall-repository';

export function createD1HallReservationRepository(db: D1Database): HallReservationRepository {
  return {
    async listVisibleReservations({ userId, admin, since }) {
      if (admin) {
        const rows = await db.prepare(`
          SELECT r.id, r.user_id, r.group_id, r.start_time, r.end_time, r.state,
                 COALESCE(u.nickname, u.name) AS user_name, ug.name AS group_name,
                 CASE WHEN r.state NOT IN ('PENDING', 'CONFIRMED') THEN 0 ELSE 1 END AS cancellable
          FROM reservations r
          LEFT JOIN users u ON r.user_id = u.id
          LEFT JOIN groups ug ON r.group_id = ug.id
          WHERE r.start_time >= ? ORDER BY r.start_time ASC
        `).bind(since).all<Record<string, unknown>>();
        return rows.results ?? [];
      }
      const rows = await db.prepare(`
        SELECT r.id, r.user_id, r.group_id, r.start_time, r.end_time, r.state,
               COALESCE(u.nickname, u.name) AS user_name, ug.name AS group_name,
               CASE
                 WHEN r.state NOT IN ('PENDING', 'CONFIRMED') THEN 0
                 WHEN r.user_id = ? THEN 1
                 WHEN r.group_id IS NOT NULL AND EXISTS (
                   SELECT 1 FROM group_member_instruments gm WHERE gm.group_id = r.group_id AND gm.user_id = ?
                 ) THEN 1 ELSE 0
               END AS cancellable
        FROM reservations r
        LEFT JOIN users u ON r.user_id = u.id
        LEFT JOIN groups ug ON r.group_id = ug.id
        WHERE (r.state IN ('PENDING', 'CONFIRMED')
          OR (r.state NOT IN ('PENDING', 'CONFIRMED') AND r.user_id = ?))
          AND r.start_time >= ?
        ORDER BY r.start_time ASC
      `).bind(userId, userId, userId, since).all<Record<string, unknown>>();
      return rows.results ?? [];
    },

    async hasUnavailableOverlap(startTime, endTime) {
      const row = await db.prepare(`
        SELECT 1 FROM unavailable_periods WHERE start_datetime < ? AND end_datetime > ? LIMIT 1
      `).bind(endTime, startTime).first();
      return Boolean(row);
    },

    async createReservation(input) {
      await db.prepare(`
        INSERT INTO reservations (id, user_id, group_id, start_time, end_time, state, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?)
      `).bind(
        input.id, input.userId, input.groupId, input.startTime, input.endTime, input.createdAt, input.createdAt
      ).run();
    },

    async findReservation(id) {
      const row = await db.prepare(`
        SELECT user_id, group_id, start_time, end_time, state, updated_at FROM reservations WHERE id = ?
      `).bind(id).first<HallReservationRecord>();
      return row ?? null;
    },

    async existsReservation(id) {
      return Boolean(await db.prepare('SELECT id FROM reservations WHERE id = ?').bind(id).first());
    },

    async deleteReservation(id) {
      await db.prepare('DELETE FROM reservations WHERE id = ?').bind(id).run();
    },

    async hasConfirmedConflict(id, startTime, endTime) {
      const row = await db.prepare(`
        SELECT id FROM reservations
        WHERE id != ? AND state = 'CONFIRMED' AND start_time < ? AND end_time > ? LIMIT 1
      `).bind(id, endTime, startTime).first();
      return Boolean(row);
    },

    async updateReservationOptimistically(input) {
      const result = await db.prepare(`
        UPDATE reservations SET start_time = ?, end_time = ?, state = ?, updated_at = ?
        WHERE id = ? AND start_time = ? AND end_time = ? AND state = ? AND updated_at = ?
          AND (
            ? != 'CONFIRMED'
            OR NOT EXISTS (
              SELECT 1 FROM reservations other
              WHERE other.id != ? AND other.state = 'CONFIRMED'
                AND other.start_time < ? AND other.end_time > ?
            )
          )
      `).bind(
        input.startTime, input.endTime, input.state, input.updatedAt,
        input.id, input.previous.start_time, input.previous.end_time, input.previous.state, input.previous.updated_at,
        input.state, input.id, input.endTime, input.startTime
      ).run();
      return Number(result.meta.changes ?? 0) > 0;
    },

    async restoreReservation(input) {
      await db.prepare(`
        UPDATE reservations SET start_time = ?, end_time = ?, state = ?, updated_at = ?
        WHERE id = ? AND start_time = ? AND end_time = ? AND state = ? AND updated_at = ?
      `).bind(
        input.previous.start_time, input.previous.end_time, input.previous.state, input.restoredAt,
        input.id, input.currentStartTime, input.currentEndTime, input.currentState, input.currentUpdatedAt
      ).run();
    },

    async updateStatusOptimistically(input) {
      const result = await db.prepare(`
        UPDATE reservations SET state = ?, updated_at = ?
        WHERE id = ? AND state = ? AND updated_at = ?
          AND (
            ? != 'CONFIRMED'
            OR NOT EXISTS (
              SELECT 1 FROM reservations other
              WHERE other.id != ? AND other.state = 'CONFIRMED'
                AND other.start_time < ? AND other.end_time > ?
            )
          )
      `).bind(
        input.nextState, input.updatedAt, input.id, input.previousState, input.previousUpdatedAt,
        input.nextState, input.id, input.endTime, input.startTime
      ).run();
      return Number(result.meta.changes ?? 0) > 0;
    },

    async updateState(id, state: ReservationState, updatedAt) {
      await db.prepare('UPDATE reservations SET state = ?, updated_at = ? WHERE id = ?')
        .bind(state, updatedAt, id).run();
    },

    async listUnavailablePeriods() {
      const rows = await db.prepare(`
        SELECT id, start_datetime, end_datetime, reason FROM unavailable_periods ORDER BY start_datetime ASC
      `).all<Record<string, unknown>>();
      return rows.results ?? [];
    },

    async listAffectedReservations(startTime, endTime) {
      const rows = await db.prepare(`
        SELECT id, start_time, end_time FROM reservations
        WHERE state IN ('PENDING', 'CONFIRMED') AND start_time < ? AND end_time > ?
      `).bind(endTime, startTime).all<AffectedHallReservation>();
      return rows.results ?? [];
    },

    async createUnavailablePeriodWithAdjustments(input) {
      const statements = [db.prepare(`
        INSERT INTO unavailable_periods (id, start_datetime, end_datetime, reason, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(input.id, input.startTime, input.endTime, input.reason, input.createdAt, input.createdAt)];
      for (const adjustment of input.adjustments) {
        statements.push(adjustment.decline
          ? db.prepare(`
              UPDATE reservations SET state = 'DECLINED', updated_at = ?
              WHERE id = ? AND state IN ('PENDING', 'CONFIRMED')
            `).bind(input.createdAt, adjustment.reservationId)
          : db.prepare(`
              UPDATE reservations SET start_time = ?, end_time = ?, updated_at = ?
              WHERE id = ? AND state IN ('PENDING', 'CONFIRMED')
            `).bind(adjustment.startTime, adjustment.endTime, input.createdAt, adjustment.reservationId));
      }
      await db.batch(statements);
    },

    async existsUnavailablePeriod(id) {
      return Boolean(await db.prepare('SELECT id FROM unavailable_periods WHERE id = ?').bind(id).first());
    },

    async deleteUnavailablePeriod(id) {
      await db.prepare('DELETE FROM unavailable_periods WHERE id = ?').bind(id).run();
    },
  };
}
