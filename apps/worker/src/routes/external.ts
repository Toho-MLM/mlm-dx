import { Hono } from 'hono';
import { ZodError } from 'zod';
import { requireAuth } from '../middleware/auth';
import type { Bindings, Variables } from '../index';
import { isUserInGroup } from './groups';
import { hasReservationLimitConflict } from './reservations';
import { requireAdmin } from '../utils/admin';
import { broadcastReservationRealtimeEvent } from '../utils/reservation-realtime';
import type { EmailNotificationType } from '../../../../lib/shared-schemas';
import { prepareAndSendReservationEmail, prepareReservationEmail, sendPreparedReservationEmail } from '../utils/reservation-email';
import {
  CheckExternalReservationRequestSchema,
  CreateExternalLotteryApplicationRequestSchema,
  CreateExternalRequestSchema,
  CreateExternalReservationRequestSchema,
  ExternalLotteryApplicationSchema,
  ExternalReservationConflictSchema,
  ExternalReservationSchema,
  ExternalSchema,
  UpdateExternalReservationRequestSchema,
  UpdateReservationStatusRequestSchema,
  EXTERNAL_LOTTERY_DURATION_STEP_MINUTES,
  EXTERNAL_LOTTERY_MAX_DURATION_MINUTES,
  EXTERNAL_LOTTERY_MIN_DURATION_MINUTES,
  isExternalLotteryReservationProtected,
  validateExternalReservationTime,
  type ReservationState,
} from '../../../../lib/shared-schemas';
import { parseUuid } from '../utils/uuid';
import { getJSTDateString, getJSTDayRange } from '../utils/reservation-processor';
import { getExternalLotteryFairnessScore } from '../utils/external-lottery';

const externalStudioRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();
const externalReservationRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

type StudioRow = { id: string; start_datetime: string; end_datetime: string; room_names: string; created_at: string; updated_at: string };
type GroupMemberRow = { id: string; name: string };
type ConflictRow = {
  reservation_id: string;
  reservation_type: 'HALL' | 'EXTERNAL';
  reservation_name: string | null;
  location_name: string;
  start_time: string;
  end_time: string;
  member_id: string;
};

function parseRoomNames(value: string): string[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.some((name) => typeof name !== 'string' || name.trim() === '')) {
    throw new Error('INVALID_EXTERNAL_ROOM_NAMES');
  }
  return parsed;
}

function normalizeStudio(row: StudioRow) {
  return ExternalSchema.parse({ ...row, room_names: parseRoomNames(row.room_names) });
}

async function getStudio(env: Bindings, id: string): Promise<(StudioRow & { roomNames: string[] }) | null> {
  const row = await env.DB.prepare(`
    SELECT id, start_datetime, end_datetime, room_names, created_at, updated_at
    FROM external_studios WHERE id = ?
  `).bind(id).first<StudioRow>();
  return row ? { ...row, roomNames: parseRoomNames(row.room_names) } : null;
}

async function getIdentityMembers(env: Bindings, userId: string, groupId: string | null): Promise<GroupMemberRow[]> {
  if (!groupId) {
    const user = await env.DB.prepare(`
      SELECT id, COALESCE(nickname, name) AS name FROM users WHERE id = ?
    `).bind(userId).first<GroupMemberRow>();
    return user ? [user] : [];
  }
  const members = await env.DB.prepare(`
    SELECT DISTINCT u.id, COALESCE(u.nickname, u.name) AS name
    FROM group_member_instruments gm
    INNER JOIN users u ON u.id = gm.user_id
    WHERE gm.group_id = ?
    ORDER BY name ASC
  `).bind(groupId).all<GroupMemberRow>();
  return members.results;
}

async function validateReservationBase(
  env: Bindings,
  userId: string,
  userRole: string,
  externalStudioId: string,
  roomNumber: number,
  groupId: string | null,
  startTime: string,
  endTime: string,
  isAdminMode: boolean,
  excludeReservationId?: string
): Promise<{ error?: string; status?: 400 | 403 | 404 | 409 }> {
  if (isAdminMode) {
    try { requireAdmin(userRole); } catch { return { error: 'INSUFFICIENT_PERMISSIONS', status: 403 }; }
  }
  const validation = validateExternalReservationTime(startTime, endTime);
  if (!validation.isValid) return { error: validation.error || 'INVALID_RESERVATION_TIME', status: 400 };

  if (groupId) {
    const group = await env.DB.prepare('SELECT id FROM groups WHERE id = ? AND is_active = TRUE').bind(groupId).first();
    if (!group) return { error: 'GROUP_NOT_FOUND', status: 400 };
    if (!isAdminMode && !await isUserInGroup(env, userId, groupId)) return { error: 'NOT_GROUP_MEMBER', status: 403 };
  }

  const studio = await getStudio(env, externalStudioId);
  if (!studio) return { error: 'EXTERNAL_NOT_FOUND', status: 404 };
  if (roomNumber < 1 || roomNumber > studio.roomNames.length) return { error: 'INVALID_ROOM_NUMBER', status: 400 };
  if (new Date(startTime) < new Date(studio.start_datetime) || new Date(endTime) > new Date(studio.end_datetime)) {
    return { error: 'EXTERNAL_PERIOD_CONFLICT', status: 400 };
  }
  if (!isAdminMode && isExternalLotteryReservationProtected(startTime, endTime)) {
    return { error: 'EXTERNAL_LOTTERY_PERIOD_PROTECTED', status: 409 };
  }
  const conflict = await env.DB.prepare(`
    SELECT id FROM external_reservations
    WHERE external_studio_id = ? AND room_number = ? AND state = 'CONFIRMED'
      AND start_time < ? AND end_time > ?
      ${excludeReservationId ? 'AND id != ?' : ''}
    LIMIT 1
  `).bind(externalStudioId, roomNumber, endTime, startTime, ...(excludeReservationId ? [excludeReservationId] : [])).first();
  if (conflict) return { error: 'RESERVATION_CONFLICT', status: 409 };
  if (!isAdminMode && await hasReservationLimitConflict(
    env, userId, groupId, startTime, endTime,
    excludeReservationId ? { kind: 'EXTERNAL', id: excludeReservationId } : undefined
  )) return { error: 'RESERVATION_LIMIT_EXCEEDED', status: 400 };
  return {};
}

async function getMemberConflicts(env: Bindings, userId: string, groupId: string | null, startTime: string, endTime: string, excludeId?: string) {
  const members = await getIdentityMembers(env, userId, groupId);
  if (members.length === 0) return [];
  const memberIds = members.map((member) => member.id);
  const names = new Map(members.map((member) => [member.id, member.name]));
  const placeholders = memberIds.map(() => '?').join(',');
  const queries = await Promise.all([
    env.DB.prepare(`
      SELECT r.id reservation_id, 'HALL' reservation_type,
             COALESCE(g.name, 'ホール予約') reservation_name, 'ホール' location_name,
             r.start_time, r.end_time, gm.user_id member_id
      FROM reservations r
      INNER JOIN group_member_instruments gm ON gm.group_id = r.group_id
      LEFT JOIN groups g ON g.id = r.group_id
      WHERE gm.user_id IN (${placeholders}) AND r.state IN ('PENDING','CONFIRMED')
        AND r.start_time < ? AND r.end_time > ?
    `).bind(...memberIds, endTime, startTime).all<ConflictRow>(),
    env.DB.prepare(`
      SELECT r.id reservation_id, 'HALL' reservation_type,
             COALESCE(u.nickname, u.name, '個人予約') reservation_name, 'ホール' location_name,
             r.start_time, r.end_time, r.user_id member_id
      FROM reservations r LEFT JOIN users u ON u.id = r.user_id
      WHERE r.group_id IS NULL AND r.user_id IN (${placeholders}) AND r.state IN ('PENDING','CONFIRMED')
        AND r.start_time < ? AND r.end_time > ?
    `).bind(...memberIds, endTime, startTime).all<ConflictRow>(),
    env.DB.prepare(`
      SELECT er.id reservation_id, 'EXTERNAL' reservation_type,
             COALESCE(g.name, '外部予約') reservation_name,
             COALESCE(json_extract(es.room_names, '$[' || (er.room_number - 1) || ']'), '外部スタジオ') location_name,
             er.start_time, er.end_time, gm.user_id member_id
      FROM external_reservations er
      INNER JOIN group_member_instruments gm ON gm.group_id = er.group_id
      INNER JOIN external_studios es ON es.id = er.external_studio_id
      LEFT JOIN groups g ON g.id = er.group_id
      WHERE gm.user_id IN (${placeholders}) AND er.state = 'CONFIRMED'
        AND er.start_time < ? AND er.end_time > ? ${excludeId ? 'AND er.id != ?' : ''}
    `).bind(...memberIds, endTime, startTime, ...(excludeId ? [excludeId] : [])).all<ConflictRow>(),
    env.DB.prepare(`
      SELECT er.id reservation_id, 'EXTERNAL' reservation_type,
             COALESCE(u.nickname, u.name, '個人予約') reservation_name,
             COALESCE(json_extract(es.room_names, '$[' || (er.room_number - 1) || ']'), '外部スタジオ') location_name,
             er.start_time, er.end_time, er.user_id member_id
      FROM external_reservations er
      INNER JOIN external_studios es ON es.id = er.external_studio_id
      LEFT JOIN users u ON u.id = er.user_id
      WHERE er.group_id IS NULL AND er.user_id IN (${placeholders}) AND er.state = 'CONFIRMED'
        AND er.start_time < ? AND er.end_time > ? ${excludeId ? 'AND er.id != ?' : ''}
    `).bind(...memberIds, endTime, startTime, ...(excludeId ? [excludeId] : [])).all<ConflictRow>(),
  ]);
  const seen = new Set<string>();
  return queries.flatMap((query) => query.results).map((row) => ({
    member_id: row.member_id,
    member_name: names.get(row.member_id) || 'メンバー',
    reservation_id: row.reservation_id,
    reservation_type: row.reservation_type,
    reservation_name: row.reservation_name || '予約',
    location_name: row.location_name,
    start_time: row.start_time,
    end_time: row.end_time,
  })).filter((item) => {
    const key = `${item.member_id}:${item.reservation_type}:${item.reservation_id}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  }).map((item) => ExternalReservationConflictSchema.parse(item));
}

function notificationForStatus(state: ReservationState): EmailNotificationType | null {
  if (state === 'PENDING') return 'RESERVATION_RECEIVED';
  if (state === 'CONFIRMED') return 'RESERVATION_CONFIRMED';
  if (state === 'COMPLETED') return null;
  return 'RESERVATION_REVOKED';
}

externalStudioRoutes.use('*', requireAuth);
externalReservationRoutes.use('*', requireAuth);

externalStudioRoutes.get('/studios', async (c) => {
  try {
    const rows = await c.env.DB.prepare(`
      SELECT id, start_datetime, end_datetime, room_names, created_at, updated_at
      FROM external_studios ORDER BY start_datetime ASC, id ASC
    `).all<StudioRow>();
    return c.json({ success: true, data: rows.results.map(normalizeStudio) });
  } catch (error) {
    console.error('Error fetching external studios:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

externalStudioRoutes.post('/studios/bulk', async (c) => {
  try {
    requireAdmin(c.get('user').role);
    const data = CreateExternalRequestSchema.parse(await c.req.json());
    const roomNames = data.names.map((name) => name.trim());
    if (roomNames.some((name) => !name) || new Set(roomNames).size !== roomNames.length) {
      return c.json({ success: false, error: 'INVALID_ROOM_NAMES' }, 400);
    }
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await c.env.DB.prepare(`
      INSERT INTO external_studios (id, start_datetime, end_datetime, room_names, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(id, data.start_datetime, data.end_datetime, JSON.stringify(roomNames), now, now).run();
    await broadcastReservationRealtimeEvent(c.env, 'reservations_changed');
    return c.json({ success: true, data: { id, start_datetime: data.start_datetime, end_datetime: data.end_datetime, room_names: roomNames } });
  } catch (error) {
    if (error instanceof ZodError) return c.json({ success: false, error: 'INVALID_INPUT' }, 400);
    if (error instanceof Error && error.message === 'INSUFFICIENT_PERMISSIONS') return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403);
    console.error('Error creating external studio:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

externalStudioRoutes.delete('/studios/:id', async (c) => {
  try {
    requireAdmin(c.get('user').role);
    const id = parseUuid(c.req.param('id'));
    if (!id) return c.json({ success: false, error: 'INVALID_INPUT' }, 400);
    if (!await getStudio(c.env, id)) return c.json({ success: false, error: 'EXTERNAL_NOT_FOUND' }, 404);
    const affected = await c.env.DB.prepare(`
      SELECT id FROM external_reservations WHERE external_studio_id = ? AND state = 'CONFIRMED'
    `).bind(id).all<{ id: string }>();
    const preparedEmails = [];
    for (const reservation of affected.results) {
      try {
        preparedEmails.push(await prepareReservationEmail(c.env, {
          kind: 'EXTERNAL', reservationId: reservation.id,
          notificationType: 'RESERVATION_REVOKED', reservationStatusOverride: 'DECLINED',
        }));
      } catch (error) { console.error('Failed to prepare revoked external email:', error); }
    }
    await c.env.DB.prepare("UPDATE external_lottery_applications SET state = 'CANCELLED', updated_at = ? WHERE external_studio_id = ? AND state = 'PENDING'")
      .bind(new Date().toISOString(), id).run();
    await c.env.DB.prepare('DELETE FROM external_reservations WHERE external_studio_id = ?').bind(id).run();
    await c.env.DB.prepare('DELETE FROM external_studios WHERE id = ?').bind(id).run();
    await broadcastReservationRealtimeEvent(c.env, 'reservations_changed');
    c.executionCtx.waitUntil((async () => { for (const email of preparedEmails) await sendPreparedReservationEmail(c.env, email); })());
    return c.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'INSUFFICIENT_PERMISSIONS') return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403);
    console.error('Error deleting external studio:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

externalReservationRoutes.get('/', async (c) => {
  try {
    const user = c.get('user');
    const admin = c.req.query('admin') === 'true';
    if (admin) { try { requireAdmin(user.role); } catch { return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403); } }
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
    const rows = admin ? await c.env.DB.prepare(query).all() : await c.env.DB.prepare(query).bind(user.id, user.id, user.id, user.id).all();
    return c.json({
      success: true,
      data: rows.results.map((row) => ExternalReservationSchema.parse({
        ...row,
        cancellable: Boolean(row.cancellable),
      })),
    });
  } catch (error) {
    console.error('Error fetching external reservations:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

externalReservationRoutes.post('/check', async (c) => {
  try {
    const user = c.get('user');
    const data = CheckExternalReservationRequestSchema.parse(await c.req.json());
    const groupId = data.group_id ?? null;
    const validation = await validateReservationBase(
      c.env, user.id, user.role, data.external_studio_id, data.room_number,
      groupId, data.start_time, data.end_time, data.admin === true
    );
    if (validation.error) return c.json({ success: false, error: validation.error }, validation.status || 400);
    return c.json({ success: true, data: await getMemberConflicts(c.env, user.id, groupId, data.start_time, data.end_time) });
  } catch (error) {
    if (error instanceof ZodError) return c.json({ success: false, error: 'INVALID_INPUT' }, 400);
    console.error('Error checking external reservation:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

externalReservationRoutes.post('/', async (c) => {
  try {
    const user = c.get('user');
    const data = CreateExternalReservationRequestSchema.parse(await c.req.json());
    const groupId = data.group_id ?? null;
    const admin = data.admin === true;
    const validation = await validateReservationBase(c.env, user.id, user.role, data.external_studio_id, data.room_number, groupId, data.start_time, data.end_time, admin);
    if (validation.error) return c.json({ success: false, error: validation.error }, validation.status || 400);
    const conflicts = await getMemberConflicts(c.env, user.id, groupId, data.start_time, data.end_time);
    if (conflicts.length && !data.acknowledged_member_conflicts) return c.json({ success: false, error: 'MEMBER_RESERVATION_CONFLICT_WARNING', data: conflicts });
    const id = crypto.randomUUID(); const now = new Date().toISOString();
    await c.env.DB.prepare(`
      INSERT INTO external_reservations
        (id, external_studio_id, room_number, user_id, group_id, start_time, end_time, state, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'CONFIRMED', ?, ?)
    `).bind(id, data.external_studio_id, data.room_number, user.id, groupId, data.start_time, data.end_time, now, now).run();
    await broadcastReservationRealtimeEvent(c.env, 'reservations_changed');
    c.executionCtx.waitUntil(prepareAndSendReservationEmail(c.env, { kind: 'EXTERNAL', reservationId: id, notificationType: 'RESERVATION_CONFIRMED' }));
    return c.json({ success: true });
  } catch (error) {
    if (error instanceof ZodError) return c.json({ success: false, error: 'INVALID_INPUT' }, 400);
    console.error('Error creating external reservation:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

externalReservationRoutes.get('/lottery', async (c) => {
  try {
    const query = `
      SELECT ela.*, COALESCE(u.nickname, u.name) user_name, g.name group_name, g.is_main,
             es.start_datetime studio_start_datetime, es.end_datetime studio_end_datetime, es.room_names,
             CASE WHEN ela.assigned_room_number IS NULL THEN NULL
               ELSE json_extract(es.room_names, '$[' || (ela.assigned_room_number - 1) || ']') END assigned_room_name
      FROM external_lottery_applications ela
      INNER JOIN external_studios es ON es.id = ela.external_studio_id
      INNER JOIN users u ON u.id = ela.user_id LEFT JOIN groups g ON g.id = ela.group_id
      WHERE ela.state != 'CANCELLED'
      ORDER BY es.start_datetime ASC, ela.created_at ASC`;
    const rows = await c.env.DB.prepare(query).all<Record<string, unknown>>();
    const fairnessCache = new Map<string, Promise<number>>();
    const data = await Promise.all(rows.results.map(async (row) => {
      let fairnessScore = row.fairness_score;
      if (row.state === 'PENDING') {
        const groupId = row.group_id === null ? null : String(row.group_id);
        const targetDate = getJSTDateString(new Date(String(row.studio_start_datetime)));
        const cacheKey = `${targetDate}:${groupId ?? `user:${String(row.user_id)}`}`;
        let scorePromise = fairnessCache.get(cacheKey);
        if (!scorePromise) {
          scorePromise = getExternalLotteryFairnessScore(
            c.env,
            String(row.user_id),
            groupId,
            getJSTDayRange(targetDate).startUTC
          );
          fairnessCache.set(cacheKey, scorePromise);
        }
        fairnessScore = await scorePromise;
      }
      return ExternalLotteryApplicationSchema.parse({
        ...row,
        fairness_score: fairnessScore,
        is_main: row.is_main === null ? null : Boolean(row.is_main),
        room_names: parseRoomNames(String(row.room_names)),
      });
    }));
    return c.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching external lottery applications:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

externalReservationRoutes.post('/lottery', async (c) => {
  try {
    const user = c.get('user');
    const data = CreateExternalLotteryApplicationRequestSchema.parse(await c.req.json());
    const groupId = data.group_id ?? null;
    if (groupId && !await isUserInGroup(c.env, user.id, groupId)) return c.json({ success: false, error: 'NOT_GROUP_MEMBER' }, 403);
    const studio = await getStudio(c.env, data.external_studio_id);
    if (!studio) return c.json({ success: false, error: 'EXTERNAL_NOT_FOUND' }, 404);
    const preferredStart = data.preferred_start_datetime ? new Date(data.preferred_start_datetime) : null;
    const preferredEnd = data.preferred_end_datetime ? new Date(data.preferred_end_datetime) : null;
    const targetDate = preferredStart
      ? getJSTDateString(preferredStart)
      : getJSTDateString(new Date(studio.start_datetime));
    const today = getJSTDateString(new Date());
    const tomorrow = new Date(`${today}T00:00:00+09:00`); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const max = new Date(`${today}T00:00:00+09:00`); max.setUTCDate(max.getUTCDate() + 14);
    const target = new Date(`${targetDate}T00:00:00+09:00`);
    if (target < tomorrow || target > max) return c.json({ success: false, error: 'EXTERNAL_LOTTERY_DATE_OUT_OF_RANGE' }, 400);
    const drawAt = new Date(`${targetDate}T21:00:00+09:00`);
    drawAt.setUTCDate(drawAt.getUTCDate() - 1);
    if (new Date() >= drawAt) return c.json({ success: false, error: 'EXTERNAL_LOTTERY_CLOSED' }, 400);
    if (preferredStart && preferredEnd) {
      if (
        getJSTDateString(preferredStart) !== targetDate
        || getJSTDateString(preferredEnd) !== targetDate
        || preferredStart < new Date(studio.start_datetime)
        || preferredEnd > new Date(studio.end_datetime)
      ) {
        return c.json({ success: false, error: 'EXTERNAL_PERIOD_CONFLICT' }, 400);
      }
      const startMinute = preferredStart.getTime() / 60000;
      const endMinute = preferredEnd.getTime() / 60000;
      if (!Number.isInteger(startMinute / 5) || !Number.isInteger(endMinute / 5)) return c.json({ success: false, error: 'INVALID_TIME_UNIT' }, 400);
    }
    const rangeStart = preferredStart?.toISOString() ?? studio.start_datetime;
    const rangeEnd = preferredEnd?.toISOString() ?? studio.end_datetime;
    const overlap = await c.env.DB.prepare(`
      SELECT ela.id FROM external_lottery_applications ela
      INNER JOIN external_studios es ON es.id = ela.external_studio_id
      WHERE ela.state = 'PENDING'
        AND ((? IS NULL AND ela.group_id IS NULL AND ela.user_id = ?) OR ela.group_id = ?)
        AND COALESCE(ela.preferred_start_datetime, es.start_datetime) < ?
        AND COALESCE(ela.preferred_end_datetime, es.end_datetime) > ?
      LIMIT 1
    `).bind(groupId, user.id, groupId, rangeEnd, rangeStart).first();
    if (overlap) return c.json({ success: false, error: 'LOTTERY_APPLICATION_CONFLICT' }, 409);

    const holdStart = preferredStart ?? new Date(studio.start_datetime);
    const availableEnd = preferredEnd ?? new Date(studio.end_datetime);
    const requestedMinutes = data.requested_duration_minutes;
    const holdEnd = new Date(holdStart.getTime() + requestedMinutes * 60000);
    if (
      requestedMinutes < EXTERNAL_LOTTERY_MIN_DURATION_MINUTES ||
      requestedMinutes > EXTERNAL_LOTTERY_MAX_DURATION_MINUTES ||
      requestedMinutes % EXTERNAL_LOTTERY_DURATION_STEP_MINUTES !== 0 ||
      holdEnd > availableEnd
    ) {
      return c.json({ success: false, error: 'INVALID_RESERVATION_TIME' }, 400);
    }
    if (await hasReservationLimitConflict(
      c.env,
      user.id,
      groupId,
      holdStart.toISOString(),
      holdEnd.toISOString()
    )) {
      return c.json({ success: false, error: 'RESERVATION_LIMIT_EXCEEDED' }, 400);
    }

    const id = crypto.randomUUID(); const now = new Date().toISOString();
    await c.env.DB.prepare(`
      INSERT INTO external_lottery_applications
        (id, external_studio_id, user_id, group_id, preferred_start_datetime, preferred_end_datetime,
         requested_duration_minutes, state, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)
    `).bind(id, studio.id, user.id, groupId, data.preferred_start_datetime, data.preferred_end_datetime, data.requested_duration_minutes, now, now).run();
    return c.json({ success: true, data: { id } });
  } catch (error) {
    if (error instanceof ZodError) return c.json({ success: false, error: 'INVALID_INPUT' }, 400);
    console.error('Error creating external lottery application:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

externalReservationRoutes.post('/lottery/:id/cancel', async (c) => {
  try {
    const user = c.get('user'); const id = parseUuid(c.req.param('id'));
    if (!id) return c.json({ success: false, error: 'INVALID_INPUT' }, 400);
    const application = await c.env.DB.prepare(`SELECT user_id, group_id, state FROM external_lottery_applications WHERE id = ?`)
      .bind(id).first<{ user_id: string; group_id: string | null; state: string }>();
    if (!application) return c.json({ success: false, error: 'LOTTERY_APPLICATION_NOT_FOUND' }, 404);
    const permitted = application.user_id === user.id || (application.group_id !== null && await isUserInGroup(c.env, user.id, application.group_id));
    if (!permitted) return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403);
    if (application.state !== 'PENDING') return c.json({ success: false, error: 'LOTTERY_APPLICATION_CANNOT_BE_CANCELLED' }, 400);
    const cancelResult = await c.env.DB.prepare("UPDATE external_lottery_applications SET state = 'CANCELLED', updated_at = ? WHERE id = ? AND state = 'PENDING'")
      .bind(new Date().toISOString(), id).run();
    if (Number(cancelResult.meta.changes ?? 0) === 0) {
      return c.json({ success: false, error: 'LOTTERY_APPLICATION_CANNOT_BE_CANCELLED' }, 400);
    }
    return c.json({ success: true });
  } catch (error) {
    console.error('Error cancelling lottery application:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

externalReservationRoutes.put('/:id', async (c) => {
  try {
    const user = c.get('user'); const id = parseUuid(c.req.param('id'));
    if (!id) return c.json({ success: false, error: 'INVALID_INPUT' }, 400);
    const data = UpdateExternalReservationRequestSchema.parse(await c.req.json()); const admin = data.admin === true;
    const reservation = await c.env.DB.prepare(`
      SELECT external_studio_id, room_number, user_id, group_id, start_time, end_time, state FROM external_reservations WHERE id = ?
    `).bind(id).first<{ external_studio_id: string; room_number: number; user_id: string; group_id: string | null; start_time: string; end_time: string; state: string }>();
    if (!reservation) return c.json({ success: false, error: 'RESERVATION_NOT_FOUND' }, 404);
    const permitted = admin || reservation.user_id === user.id || (reservation.group_id !== null && await isUserInGroup(c.env, user.id, reservation.group_id));
    if (!permitted) return c.json({ success: false, error: 'RESERVATION_CANNOT_BE_EDITED' }, 403);
    if (reservation.state !== 'CONFIRMED' || new Date() >= new Date(reservation.end_time)) return c.json({ success: false, error: 'RESERVATION_CANNOT_BE_EDITED' }, 400);
    const validation = await validateReservationBase(c.env, user.id, user.role, reservation.external_studio_id, reservation.room_number, reservation.group_id, data.start_time, data.end_time, admin, id);
    if (validation.error) return c.json({ success: false, error: validation.error }, validation.status || 400);
    const conflicts = await getMemberConflicts(c.env, reservation.user_id, reservation.group_id, data.start_time, data.end_time, id);
    if (conflicts.length && !data.acknowledged_member_conflicts) return c.json({ success: false, error: 'MEMBER_RESERVATION_CONFLICT_WARNING', data: conflicts });
    await c.env.DB.prepare('UPDATE external_reservations SET start_time = ?, end_time = ?, updated_at = ? WHERE id = ?')
      .bind(data.start_time, data.end_time, new Date().toISOString(), id).run();
    await broadcastReservationRealtimeEvent(c.env, 'reservations_changed');
    c.executionCtx.waitUntil(prepareAndSendReservationEmail(c.env, {
      kind: 'EXTERNAL', reservationId: id, notificationType: 'RESERVATION_EDITED',
      requestedStartTime: reservation.start_time, requestedEndTime: reservation.end_time,
    }));
    return c.json({ success: true });
  } catch (error) {
    if (error instanceof ZodError) return c.json({ success: false, error: 'INVALID_INPUT' }, 400);
    console.error('Error updating external reservation:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

externalReservationRoutes.put('/:id/status', async (c) => {
  try {
    requireAdmin(c.get('user').role); const id = parseUuid(c.req.param('id'));
    if (!id) return c.json({ success: false, error: 'INVALID_INPUT' }, 400);
    const data = UpdateReservationStatusRequestSchema.parse(await c.req.json());
    const reservation = await c.env.DB.prepare(`SELECT * FROM external_reservations WHERE id = ?`).bind(id).first<{
      id: string; external_studio_id: string; room_number: number; user_id: string; group_id: string | null; start_time: string; end_time: string; state: ReservationState;
    }>();
    if (!reservation) return c.json({ success: false, error: 'RESERVATION_NOT_FOUND' }, 404);
    if (reservation.state === data.state) return c.json({ success: true });
    if (data.state === 'CONFIRMED') {
      const conflict = await c.env.DB.prepare(`
        SELECT id FROM external_reservations WHERE id != ? AND external_studio_id = ? AND room_number = ?
          AND state = 'CONFIRMED' AND start_time < ? AND end_time > ? LIMIT 1
      `).bind(id, reservation.external_studio_id, reservation.room_number, reservation.end_time, reservation.start_time).first();
      if (conflict) return c.json({ success: false, error: 'RESERVATION_CONFLICT' }, 409);
    }
    await c.env.DB.prepare('UPDATE external_reservations SET state = ?, updated_at = ? WHERE id = ?').bind(data.state, new Date().toISOString(), id).run();
    await broadcastReservationRealtimeEvent(c.env, 'reservations_changed');
    const notification = notificationForStatus(data.state);
    if (notification) c.executionCtx.waitUntil(prepareAndSendReservationEmail(c.env, { kind: 'EXTERNAL', reservationId: id, notificationType: notification }));
    return c.json({ success: true });
  } catch (error) {
    if (error instanceof ZodError) return c.json({ success: false, error: 'INVALID_INPUT' }, 400);
    if (error instanceof Error && error.message === 'INSUFFICIENT_PERMISSIONS') return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403);
    console.error('Error updating external reservation status:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

externalReservationRoutes.delete('/:id', async (c) => {
  try {
    requireAdmin(c.get('user').role);
    const id = parseUuid(c.req.param('id'));
    if (!id) return c.json({ success: false, error: 'INVALID_INPUT' }, 400);

    const reservation = await c.env.DB.prepare('SELECT id FROM external_reservations WHERE id = ?')
      .bind(id).first<{ id: string }>();
    if (!reservation) return c.json({ success: false, error: 'RESERVATION_NOT_FOUND' }, 404);

    await c.env.DB.prepare('DELETE FROM external_reservations WHERE id = ?').bind(id).run();
    await broadcastReservationRealtimeEvent(c.env, 'reservations_changed');
    return c.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'INSUFFICIENT_PERMISSIONS') {
      return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403);
    }
    console.error('Error deleting external reservation:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

externalReservationRoutes.post('/:id/cancel', async (c) => {
  try {
    const user = c.get('user'); const id = parseUuid(c.req.param('id'));
    if (!id) return c.json({ success: false, error: 'INVALID_INPUT' }, 400);
    const admin = c.req.query('admin') === 'true'; if (admin) requireAdmin(user.role);
    const reservation = await c.env.DB.prepare('SELECT user_id, group_id, state FROM external_reservations WHERE id = ?')
      .bind(id).first<{ user_id: string; group_id: string | null; state: string }>();
    if (!reservation) return c.json({ success: false, error: 'RESERVATION_NOT_FOUND' }, 404);
    const permitted = admin || reservation.user_id === user.id || (reservation.group_id !== null && await isUserInGroup(c.env, user.id, reservation.group_id));
    if (!permitted || reservation.state !== 'CONFIRMED') return c.json({ success: false, error: 'RESERVATION_CANNOT_BE_CANCELLED' }, 403);
    await c.env.DB.prepare("UPDATE external_reservations SET state = ?, updated_at = ? WHERE id = ?")
      .bind(admin ? 'DECLINED' : 'CANCELLED', new Date().toISOString(), id).run();
    await broadcastReservationRealtimeEvent(c.env, 'reservations_changed');
    c.executionCtx.waitUntil(prepareAndSendReservationEmail(c.env, { kind: 'EXTERNAL', reservationId: id, notificationType: admin ? 'RESERVATION_REVOKED' : 'RESERVATION_CANCELLED' }));
    return c.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'INSUFFICIENT_PERMISSIONS') return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403);
    console.error('Error cancelling external reservation:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

export { externalReservationRoutes, externalStudioRoutes };
