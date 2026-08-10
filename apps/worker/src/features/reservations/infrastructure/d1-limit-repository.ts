import type { D1Database } from '@cloudflare/workers-types';
import type {
  ReservationLimitRecord,
  ReservationLimitRepository,
  ReservationLimitScope,
  UsageQuery,
} from '../application/limits';
import type { StoredTimeInterval } from '../domain/time';

type LotteryUsageRow = {
  start_time: string;
  available_end_time: string;
  requested_duration_minutes: number | null;
};

async function listBookedIntervals(db: D1Database, query: UsageQuery): Promise<StoredTimeInterval[]> {
  const targetColumn = query.scope === 'GROUP' ? 'group_id = ?' : 'user_id = ? AND group_id IS NULL';
  const excludeHall = query.exclude?.kind === 'HALL';
  const excludeExternal = query.exclude?.kind === 'EXTERNAL';
  const [hall, external] = await Promise.all([
    db.prepare(`
      SELECT start_time, end_time FROM reservations
      WHERE ${targetColumn}
        AND state IN ('PENDING', 'CONFIRMED')
        AND start_time < ? AND end_time > ?
        ${excludeHall ? 'AND id != ?' : ''}
    `).bind(
      query.targetId,
      query.rangeEndTime,
      query.rangeStartTime,
      ...(excludeHall ? [query.exclude?.id] : [])
    ).all<StoredTimeInterval>(),
    db.prepare(`
      SELECT start_time, end_time FROM external_reservations
      WHERE ${targetColumn}
        AND state IN ('PENDING', 'CONFIRMED')
        AND start_time < ? AND end_time > ?
        ${excludeExternal ? 'AND id != ?' : ''}
    `).bind(
      query.targetId,
      query.rangeEndTime,
      query.rangeStartTime,
      ...(excludeExternal ? [query.exclude?.id] : [])
    ).all<StoredTimeInterval>(),
  ]);
  return [...(hall.results ?? []), ...(external.results ?? [])];
}

async function listLotteryIntervals(db: D1Database, query: UsageQuery): Promise<StoredTimeInterval[]> {
  const targetColumn = query.scope === 'GROUP'
    ? 'application.group_id = ?'
    : 'application.user_id = ? AND application.group_id IS NULL';
  const excludeLottery = query.exclude?.kind === 'LOTTERY';
  const rows = await db.prepare(`
    SELECT COALESCE(application.preferred_start_datetime, studio.start_datetime) AS start_time,
           COALESCE(application.preferred_end_datetime, studio.end_datetime) AS available_end_time,
           application.requested_duration_minutes
    FROM external_lottery_applications application
    INNER JOIN external_studios studio ON studio.id = application.external_studio_id
    WHERE ${targetColumn}
      AND application.state = 'PENDING'
      ${excludeLottery ? 'AND application.id != ?' : ''}
  `).bind(query.targetId, ...(excludeLottery ? [query.exclude?.id] : [])).all<LotteryUsageRow>();

  return (rows.results ?? []).map((application) => ({
    start_time: application.start_time,
    end_time: new Date(
      new Date(application.start_time).getTime()
      + (application.requested_duration_minutes ?? Math.round(
        (new Date(application.available_end_time).getTime() - new Date(application.start_time).getTime()) / 60000
      )) * 60000
    ).toISOString(),
  }));
}

export function createD1ReservationLimitRepository(db: D1Database): ReservationLimitRepository {
  return {
    async listLimits(scope?: ReservationLimitScope) {
      const query = `
        SELECT id, scope, limit_type, start_datetime, end_datetime, window_days, max_minutes
        FROM reservation_limits
        ${scope ? 'WHERE scope = ?' : ''}
        ORDER BY start_datetime ASC
      `;
      const rows = scope
        ? await db.prepare(query).bind(scope).all<ReservationLimitRecord>()
        : await db.prepare(query).all<ReservationLimitRecord>();
      return (rows.results ?? []).map((row) => ({
        ...row,
        window_days: row.window_days === null ? null : Number(row.window_days),
        max_minutes: Number(row.max_minutes),
      }));
    },

    async listUsageIntervals(query) {
      const [booked, lottery] = await Promise.all([
        listBookedIntervals(db, query),
        listLotteryIntervals(db, query),
      ]);
      return [...booked, ...lottery];
    },

    async hasOverlappingFixedLimit(scope, startDatetime, endDatetime, excludeId) {
      const row = await db.prepare(`
        SELECT id FROM reservation_limits
        WHERE scope = ? AND limit_type = 'FIXED'
          AND start_datetime < ? AND end_datetime > ?
          ${excludeId ? 'AND id != ?' : ''}
        LIMIT 1
      `).bind(scope, endDatetime, startDatetime, ...(excludeId ? [excludeId] : [])).first();
      return Boolean(row);
    },

    async hasRollingLimit(scope, excludeId) {
      const row = await db.prepare(`
        SELECT id FROM reservation_limits
        WHERE scope = ? AND limit_type = 'ROLLING'
          ${excludeId ? 'AND id != ?' : ''}
        LIMIT 1
      `).bind(scope, ...(excludeId ? [excludeId] : [])).first();
      return Boolean(row);
    },

    async existsLimit(id) {
      return Boolean(await db.prepare('SELECT id FROM reservation_limits WHERE id = ?').bind(id).first());
    },

    async createLimit(limit, createdAt) {
      await db.prepare(`
        INSERT INTO reservation_limits
          (id, scope, limit_type, start_datetime, end_datetime, window_days, max_minutes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        limit.id, limit.scope, limit.limit_type, limit.start_datetime, limit.end_datetime,
        limit.window_days, limit.max_minutes, createdAt, createdAt
      ).run();
    },

    async updateLimit(limit, updatedAt) {
      await db.prepare(`
        UPDATE reservation_limits
        SET scope = ?, limit_type = ?, start_datetime = ?, end_datetime = ?, window_days = ?, max_minutes = ?, updated_at = ?
        WHERE id = ?
      `).bind(
        limit.scope, limit.limit_type, limit.start_datetime, limit.end_datetime,
        limit.window_days, limit.max_minutes, updatedAt, limit.id
      ).run();
    },

    async deleteLimit(id) {
      await db.prepare('DELETE FROM reservation_limits WHERE id = ?').bind(id).run();
    },
  };
}
