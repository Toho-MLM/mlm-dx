import type { D1Database } from '@cloudflare/workers-types';
import type {
  ExternalLotteryApplicationRecord,
  ExternalReservationRecord,
  ExternalReservationRepository,
  ExternalStudioRecord,
  MemberConflictRow,
} from '../application/external-repository';

export function createD1ExternalReservationRepository(db: D1Database): ExternalReservationRepository {
  return {
    async listStudios() {
      const rows = await db.prepare(`
        SELECT id, target_type, start_datetime, end_datetime, draw_datetime, room_names, created_at, updated_at
        FROM external_studios ORDER BY start_datetime ASC, id ASC
      `).all<ExternalStudioRecord>();
      return rows.results ?? [];
    },

    async findStudio(id) {
      return await db.prepare(`
        SELECT id, target_type, start_datetime, end_datetime, draw_datetime, room_names, created_at, updated_at
        FROM external_studios WHERE id = ?
      `).bind(id).first<ExternalStudioRecord>() ?? null;
    },

    async createStudio(input) {
      const result = await db.prepare(`
        INSERT INTO external_studios (id, target_type, start_datetime, end_datetime, draw_datetime, room_names, created_at, updated_at)
        SELECT ?, ?, ?, ?, ?, ?, ?, ?
        WHERE ? != 'HALL' OR NOT EXISTS (
          SELECT 1 FROM external_studios
          WHERE target_type = 'HALL' AND start_datetime < ? AND end_datetime > ?
        )
      `).bind(
        input.id, input.targetType, input.startTime, input.endTime, input.drawTime, JSON.stringify(input.roomNames), input.createdAt, input.createdAt,
        input.targetType, input.endTime, input.startTime
      ).run();
      return Number(result.meta.changes ?? 0) > 0;
    },

    async hasHallTargetOverlap(startTime, endTime, excludeId) {
      const row = await db.prepare(`
        SELECT id FROM external_studios
        WHERE target_type = 'HALL' AND start_datetime < ? AND end_datetime > ?
          ${excludeId ? 'AND id != ?' : ''}
        LIMIT 1
      `).bind(endTime, startTime, ...(excludeId ? [excludeId] : [])).first();
      return Boolean(row);
    },

    async closeLotteryApplications(studioId, updatedAt) {
      await db.prepare(`
        UPDATE external_lottery_applications SET state = 'CANCELLED', updated_at = ?
        WHERE external_studio_id = ? AND state = 'PENDING'
      `).bind(updatedAt, studioId).run();
    },

    async listRevocableReservationIds(studioId, targetType) {
      if (targetType === 'HALL') {
        const rows = await db.prepare(`
          SELECT reservation.id
          FROM reservations reservation
          INNER JOIN external_lottery_applications application ON application.id = reservation.id
          WHERE application.external_studio_id = ? AND reservation.state IN ('PENDING','CONFIRMED')
        `).bind(studioId).all<{ id: string }>();
        return (rows.results ?? []).map((row) => row.id);
      }
      const rows = await db.prepare(`
        SELECT id FROM external_reservations WHERE external_studio_id = ? AND state = 'CONFIRMED'
      `).bind(studioId).all<{ id: string }>();
      return (rows.results ?? []).map((row) => row.id);
    },

    async deleteStudioCascade(studioId, targetType, updatedAt) {
      const statements = [
        db.prepare(`
          UPDATE external_lottery_applications SET state = 'CANCELLED', updated_at = ?
          WHERE external_studio_id = ? AND state = 'PENDING'
        `).bind(updatedAt, studioId),
      ];
      if (targetType === 'HALL') {
        statements.unshift(db.prepare(`
          UPDATE reservations SET state = 'DECLINED', updated_at = ?
          WHERE state IN ('PENDING','CONFIRMED') AND id IN (
            SELECT id FROM external_lottery_applications WHERE external_studio_id = ?
          )
        `).bind(updatedAt, studioId));
      } else {
        statements.push(db.prepare('DELETE FROM external_reservations WHERE external_studio_id = ?').bind(studioId));
      }
      statements.push(db.prepare('DELETE FROM external_studios WHERE id = ?').bind(studioId));
      await db.batch(statements);
    },

    async hasRoomConflict(input) {
      const row = await db.prepare(`
        SELECT id FROM external_reservations
        WHERE external_studio_id = ? AND room_number = ? AND state = 'CONFIRMED'
          AND start_time < ? AND end_time > ? ${input.excludeId ? 'AND id != ?' : ''}
        LIMIT 1
      `).bind(
        input.studioId, input.roomNumber, input.endTime, input.startTime,
        ...(input.excludeId ? [input.excludeId] : [])
      ).first();
      return Boolean(row);
    },

    async listMemberConflictRows(input) {
      if (input.memberIds.length === 0) return [];
      const placeholders = input.memberIds.map(() => '?').join(',');
      const queries = await Promise.all([
        db.prepare(`
          SELECT r.id reservation_id, 'HALL' reservation_type,
                 COALESCE(g.name, 'ホール予約') reservation_name, 'ホール' location_name,
                 r.start_time, r.end_time, gm.user_id member_id
          FROM reservations r
          INNER JOIN group_member_instruments gm ON gm.group_id = r.group_id
          LEFT JOIN groups g ON g.id = r.group_id
          WHERE gm.user_id IN (${placeholders}) AND r.state IN ('PENDING','CONFIRMED')
            AND r.start_time < ? AND r.end_time > ?
        `).bind(...input.memberIds, input.endTime, input.startTime).all<MemberConflictRow>(),
        db.prepare(`
          SELECT r.id reservation_id, 'HALL' reservation_type,
                 COALESCE(u.nickname, u.name, '個人予約') reservation_name, 'ホール' location_name,
                 r.start_time, r.end_time, r.user_id member_id
          FROM reservations r LEFT JOIN users u ON u.id = r.user_id
          WHERE r.group_id IS NULL AND r.user_id IN (${placeholders}) AND r.state IN ('PENDING','CONFIRMED')
            AND r.start_time < ? AND r.end_time > ?
        `).bind(...input.memberIds, input.endTime, input.startTime).all<MemberConflictRow>(),
        db.prepare(`
          SELECT er.id reservation_id, 'EXTERNAL' reservation_type,
                 COALESCE(g.name, '外部予約') reservation_name,
                 COALESCE(json_extract(es.room_names, '$[' || (er.room_number - 1) || ']'), '外部スタジオ') location_name,
                 er.start_time, er.end_time, gm.user_id member_id
          FROM external_reservations er
          INNER JOIN group_member_instruments gm ON gm.group_id = er.group_id
          INNER JOIN external_studios es ON es.id = er.external_studio_id
          LEFT JOIN groups g ON g.id = er.group_id
          WHERE gm.user_id IN (${placeholders}) AND er.state = 'CONFIRMED'
            AND er.start_time < ? AND er.end_time > ? ${input.excludeId ? 'AND er.id != ?' : ''}
        `).bind(
          ...input.memberIds, input.endTime, input.startTime, ...(input.excludeId ? [input.excludeId] : [])
        ).all<MemberConflictRow>(),
        db.prepare(`
          SELECT er.id reservation_id, 'EXTERNAL' reservation_type,
                 COALESCE(u.nickname, u.name, '個人予約') reservation_name,
                 COALESCE(json_extract(es.room_names, '$[' || (er.room_number - 1) || ']'), '外部スタジオ') location_name,
                 er.start_time, er.end_time, er.user_id member_id
          FROM external_reservations er
          INNER JOIN external_studios es ON es.id = er.external_studio_id
          LEFT JOIN users u ON u.id = er.user_id
          WHERE er.group_id IS NULL AND er.user_id IN (${placeholders}) AND er.state = 'CONFIRMED'
            AND er.start_time < ? AND er.end_time > ? ${input.excludeId ? 'AND er.id != ?' : ''}
        `).bind(
          ...input.memberIds, input.endTime, input.startTime, ...(input.excludeId ? [input.excludeId] : [])
        ).all<MemberConflictRow>(),
      ]);
      return queries.flatMap((query) => query.results ?? []);
    },

    async listVisibleReservations(userId, admin) {
      const query = `
        SELECT er.id, er.external_studio_id, er.room_number,
               json_extract(es.room_names, '$[' || (er.room_number - 1) || ']') room_name,
               er.user_id, er.group_id, COALESCE(u.nickname, u.name) user_name, g.name group_name,
               er.start_time, er.end_time, er.state,
               CASE WHEN er.state != 'CONFIRMED' THEN 0
                 ${admin ? 'ELSE 1' : `WHEN er.user_id = ? THEN 1
                 WHEN er.group_id IS NOT NULL AND EXISTS (
                   SELECT 1 FROM group_member_instruments gm WHERE gm.group_id = er.group_id AND gm.user_id = ?
                 ) THEN 1 ELSE 0`} END cancellable
        FROM external_reservations er
        INNER JOIN external_studios es ON es.id = er.external_studio_id
        LEFT JOIN users u ON u.id = er.user_id LEFT JOIN groups g ON g.id = er.group_id
        ${admin ? '' : `WHERE er.state = 'CONFIRMED' OR er.user_id = ? OR EXISTS (
          SELECT 1 FROM group_member_instruments gm WHERE gm.group_id = er.group_id AND gm.user_id = ?
        )`}
        ORDER BY er.start_time ASC, er.room_number ASC`;
      const rows = admin
        ? await db.prepare(query).all<Record<string, unknown>>()
        : await db.prepare(query).bind(userId, userId, userId, userId).all<Record<string, unknown>>();
      return rows.results ?? [];
    },

    async createReservationIfAvailable(input) {
      const result = await db.prepare(`
        INSERT INTO external_reservations
          (id, external_studio_id, room_number, user_id, group_id, start_time, end_time, state, created_at, updated_at)
        SELECT ?, ?, ?, ?, ?, ?, ?, 'CONFIRMED', ?, ?
        WHERE NOT EXISTS (
          SELECT 1 FROM external_reservations
          WHERE external_studio_id = ? AND room_number = ? AND state = 'CONFIRMED'
            AND start_time < ? AND end_time > ?
        )
      `).bind(
        input.id, input.studioId, input.roomNumber, input.userId, input.groupId,
        input.startTime, input.endTime, input.createdAt, input.createdAt,
        input.studioId, input.roomNumber, input.endTime, input.startTime
      ).run();
      return Number(result.meta.changes ?? 0) > 0;
    },

    async findReservation(id) {
      const row = await db.prepare(`
        SELECT id, external_studio_id, room_number, user_id, group_id, start_time, end_time, state, updated_at
        FROM external_reservations WHERE id = ?
      `).bind(id).first<ExternalReservationRecord>();
      return row ? { ...row, room_number: Number(row.room_number) } : null;
    },

    async existsReservation(id) {
      return Boolean(await db.prepare('SELECT id FROM external_reservations WHERE id = ?').bind(id).first());
    },

    async deleteReservation(id) {
      await db.prepare('DELETE FROM external_reservations WHERE id = ?').bind(id).run();
    },

    async updateReservationOptimistically(input) {
      const result = await db.prepare(`
        UPDATE external_reservations SET start_time = ?, end_time = ?, updated_at = ?
        WHERE id = ? AND start_time = ? AND end_time = ? AND state = ? AND updated_at = ?
          AND NOT EXISTS (
            SELECT 1 FROM external_reservations other
            WHERE other.id != ? AND other.external_studio_id = ? AND other.room_number = ?
              AND other.state = 'CONFIRMED' AND other.start_time < ? AND other.end_time > ?
          )
      `).bind(
        input.startTime, input.endTime, input.updatedAt, input.id,
        input.previous.start_time, input.previous.end_time, input.previous.state, input.previous.updated_at,
        input.id, input.previous.external_studio_id, input.previous.room_number, input.endTime, input.startTime
      ).run();
      return Number(result.meta.changes ?? 0) > 0;
    },

    async restoreReservation(input) {
      await db.prepare(`
        UPDATE external_reservations SET start_time = ?, end_time = ?, updated_at = ?
        WHERE id = ? AND start_time = ? AND end_time = ? AND state = ? AND updated_at = ?
      `).bind(
        input.previous.start_time, input.previous.end_time, input.restoredAt, input.id,
        input.currentStartTime, input.currentEndTime, input.previous.state, input.currentUpdatedAt
      ).run();
    },

    async updateStatusOptimistically(input) {
      const r = input.reservation;
      const result = await db.prepare(`
        UPDATE external_reservations SET state = ?, updated_at = ?
        WHERE id = ? AND state = ? AND updated_at = ?
          AND (
            ? != 'CONFIRMED'
            OR NOT EXISTS (
              SELECT 1 FROM external_reservations other
              WHERE other.id != ? AND other.external_studio_id = ? AND other.room_number = ?
                AND other.state = 'CONFIRMED' AND other.start_time < ? AND other.end_time > ?
            )
          )
      `).bind(
        input.nextState, input.updatedAt, r.id, r.state, r.updated_at, input.nextState,
        r.id, r.external_studio_id, r.room_number, r.end_time, r.start_time
      ).run();
      return Number(result.meta.changes ?? 0) > 0;
    },

    async updateState(id, state, updatedAt) {
      await db.prepare('UPDATE external_reservations SET state = ?, updated_at = ? WHERE id = ?')
        .bind(state, updatedAt, id).run();
    },

    async listLotteryApplications() {
      const rows = await db.prepare(`
        SELECT ela.*, COALESCE(u.nickname, u.name) user_name, g.name group_name, g.main_index,
               es.target_type, es.start_datetime studio_start_datetime, es.end_datetime studio_end_datetime, es.room_names,
               CASE WHEN ela.assigned_room_number IS NULL THEN NULL
                 ELSE json_extract(es.room_names, '$[' || (ela.assigned_room_number - 1) || ']') END assigned_room_name
        FROM external_lottery_applications ela
        INNER JOIN external_studios es ON es.id = ela.external_studio_id
        INNER JOIN users u ON u.id = ela.user_id LEFT JOIN groups g ON g.id = ela.group_id
        WHERE ela.state != 'CANCELLED'
        ORDER BY es.start_datetime ASC, ela.created_at ASC
      `).all<Record<string, unknown>>();
      return rows.results ?? [];
    },

    async hasLotteryOverlap(input) {
      const row = await db.prepare(`
        SELECT ela.id FROM external_lottery_applications ela
        INNER JOIN external_studios es ON es.id = ela.external_studio_id
        WHERE ela.state = 'PENDING'
          AND ((? IS NULL AND ela.group_id IS NULL AND ela.user_id = ?) OR ela.group_id = ?)
          AND COALESCE(ela.preferred_start_datetime, es.start_datetime) < ?
          AND COALESCE(ela.preferred_end_datetime, es.end_datetime) > ?
        LIMIT 1
      `).bind(input.groupId, input.userId, input.groupId, input.rangeEnd, input.rangeStart).first();
      return Boolean(row);
    },

    async createLotteryApplicationIfAvailable(input) {
      const result = await db.prepare(`
        INSERT INTO external_lottery_applications
          (id, external_studio_id, user_id, group_id, preferred_start_datetime, preferred_end_datetime,
           requested_duration_minutes, state, created_at, updated_at)
        SELECT ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?
        WHERE NOT EXISTS (
          SELECT 1 FROM external_lottery_applications ela
          INNER JOIN external_studios es ON es.id = ela.external_studio_id
          WHERE ela.state = 'PENDING'
            AND ((? IS NULL AND ela.group_id IS NULL AND ela.user_id = ?) OR ela.group_id = ?)
            AND COALESCE(ela.preferred_start_datetime, es.start_datetime) < ?
            AND COALESCE(ela.preferred_end_datetime, es.end_datetime) > ?
        )
      `).bind(
        input.id, input.studioId, input.userId, input.groupId, input.preferredStart, input.preferredEnd,
        input.requestedMinutes, input.createdAt, input.createdAt,
        input.groupId, input.userId, input.groupId, input.rangeEnd, input.rangeStart
      ).run();
      return Number(result.meta.changes ?? 0) > 0;
    },

    async findLotteryApplication(id) {
      return await db.prepare(`
        SELECT user_id, group_id, state FROM external_lottery_applications WHERE id = ?
      `).bind(id).first<ExternalLotteryApplicationRecord>() ?? null;
    },

    async cancelPendingLotteryApplication(id, updatedAt) {
      const result = await db.prepare(`
        UPDATE external_lottery_applications SET state = 'CANCELLED', updated_at = ?
        WHERE id = ? AND state = 'PENDING'
      `).bind(updatedAt, id).run();
      return Number(result.meta.changes ?? 0) > 0;
    },

    async deleteLotteryApplication(id) {
      await db.prepare('DELETE FROM external_lottery_applications WHERE id = ?').bind(id).run();
    },
  };
}
