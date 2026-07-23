import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth';
import type { Bindings, Variables } from '../index';
import { isUserInGroup } from './groups';
import { hasReservationLimitConflict } from './reservations';
import { requireAdmin } from '../utils/admin';
import { broadcastReservationRealtimeEvent } from '../utils/reservation-realtime';
import { getAvailableExternalIntervals, processExternalReservationState } from '../utils/external-processor';
import type { EmailNotificationType } from '../../../../lib/shared-schemas';
import {
  prepareAndSendReservationEmail,
  prepareReservationEmail,
  sendPreparedReservationEmail,
} from '../utils/reservation-email';
import {
  CheckExternalReservationRequestSchema,
  CreateExternalRequestSchema,
  CreateExternalReservationRequestSchema,
  ExternalReservationConflictSchema,
  ExternalReservationSchema,
  ExternalSchema,
  UpdateExternalReservationRequestSchema,
  UpdateReservationStatusRequestSchema,
  validateReservationTime,
  type ReservationState,
} from '../../../../lib/shared-schemas';
import { parseUuid } from '../utils/uuid';
import { ZodError } from 'zod';
import { getJSTDateString, validateReservationDateRange } from '../utils/reservation-processor';

const externalStudioRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();
const externalReservationRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

type GroupMemberRow = {
  id: string;
  name: string;
};

type ConflictRow = {
  reservation_id: string;
  reservation_type: 'HALL' | 'EXTERNAL';
  reservation_name: string | null;
  location_name: string;
  start_time: string;
  end_time: string;
  member_id: string;
};

async function getGroupMembers(env: Bindings, groupId: string): Promise<GroupMemberRow[]> {
  const rows = await env.DB.prepare(`
    SELECT DISTINCT u.id, COALESCE(u.nickname, u.name) as name
    FROM group_member_instruments gm
    INNER JOIN users u ON u.id = gm.user_id
    WHERE gm.group_id = ?
    ORDER BY name ASC
  `).bind(groupId).all<GroupMemberRow>();

  return rows.results;
}

async function validateExternalReservationBase(
  env: Bindings,
  userId: string,
  userRole: string,
  externalStudioId: string,
  groupId: string,
  startTime: string,
  endTime: string,
  isAdminMode: boolean,
  excludeReservationId?: string
): Promise<{ error?: string; status?: 400 | 403 | 404 | 409 }> {
  if (isAdminMode) {
    try {
      requireAdmin(userRole);
    } catch {
      return { error: 'INSUFFICIENT_PERMISSIONS', status: 403 };
    }
  }

  const validation = validateReservationTime(startTime, endTime);
  if (!validation.isValid) {
    return { error: validation.error || 'INVALID_RESERVATION_TIME', status: 400 };
  }

  const dateValidation = validateReservationDateRange(new Date(startTime));
  if (!dateValidation.isValid) {
    return { error: dateValidation.error, status: 400 };
  }

  const group = await env.DB.prepare(`
    SELECT id
    FROM groups
    WHERE id = ? AND is_active = TRUE
  `).bind(groupId).first<{ id: string }>();

  if (!group) {
    return { error: 'GROUP_NOT_FOUND', status: 400 };
  }

  const isMember = isAdminMode || await isUserInGroup(env, userId, groupId);
  if (!isMember) {
    return { error: 'NOT_GROUP_MEMBER', status: 403 };
  }

  const external = await env.DB.prepare(`
    SELECT id, start_datetime, end_datetime
    FROM external_studios
    WHERE id = ?
  `).bind(externalStudioId).first<{ id: string; start_datetime: string; end_datetime: string }>();

  if (!external) {
    return { error: 'EXTERNAL_NOT_FOUND', status: 404 };
  }

  if (
    new Date(startTime) < new Date(external.start_datetime)
    || new Date(endTime) > new Date(external.end_datetime)
  ) {
    return { error: 'EXTERNAL_PERIOD_CONFLICT', status: 400 };
  }

  const conflictingReservation = await env.DB.prepare(`
    SELECT id
    FROM external_reservations
    WHERE external_studio_id = ?
      AND state IN ('PENDING', 'CONFIRMED')
      AND start_time < ?
      AND end_time > ?
      ${excludeReservationId ? 'AND id != ?' : ''}
    LIMIT 1
  `).bind(externalStudioId, endTime, startTime, ...(excludeReservationId ? [excludeReservationId] : [])).first<{ id: string }>();

  if (conflictingReservation) {
    return { error: 'RESERVATION_CONFLICT', status: 409 };
  }

  if (!isAdminMode) {
    const isLimitExceeded = await hasReservationLimitConflict(
      env,
      userId,
      groupId,
      startTime,
      endTime,
      excludeReservationId ? { kind: 'EXTERNAL', id: excludeReservationId } : undefined
    );
    if (isLimitExceeded) {
      return { error: 'RESERVATION_LIMIT_EXCEEDED', status: 400 };
    }
  }

  return {};
}

async function getMemberConflicts(
  env: Bindings,
  groupId: string,
  startTime: string,
  endTime: string,
  excludeExternalReservationId?: string
) {
  const members = await getGroupMembers(env, groupId);
  if (members.length === 0) {
    return [];
  }

  const memberIds = members.map((member) => member.id);
  const memberNames = new Map(members.map((member) => [member.id, member.name]));
  const placeholders = memberIds.map(() => '?').join(',');

  const hallGroupConflicts = await env.DB.prepare(`
    SELECT r.id as reservation_id,
           'HALL' as reservation_type,
           COALESCE(g.name, COALESCE(u.nickname, u.name), 'ホール予約') as reservation_name,
           'ホール' as location_name,
           r.start_time,
           r.end_time,
           gm.user_id as member_id
    FROM reservations r
    INNER JOIN group_member_instruments gm ON gm.group_id = r.group_id
    LEFT JOIN groups g ON g.id = r.group_id
    LEFT JOIN users u ON u.id = r.user_id
    WHERE r.group_id IS NOT NULL
      AND gm.user_id IN (${placeholders})
      AND r.state IN ('PENDING', 'CONFIRMED')
      AND r.start_time < ?
      AND r.end_time > ?
  `).bind(...memberIds, endTime, startTime).all<ConflictRow>();

  const hallPersonalConflicts = await env.DB.prepare(`
    SELECT r.id as reservation_id,
           'HALL' as reservation_type,
           COALESCE(u.nickname, u.name, '個人予約') as reservation_name,
           'ホール' as location_name,
           r.start_time,
           r.end_time,
           r.user_id as member_id
    FROM reservations r
    LEFT JOIN users u ON u.id = r.user_id
    WHERE r.group_id IS NULL
      AND r.user_id IN (${placeholders})
      AND r.state IN ('PENDING', 'CONFIRMED')
      AND r.start_time < ?
      AND r.end_time > ?
  `).bind(...memberIds, endTime, startTime).all<ConflictRow>();

  const externalConflicts = await env.DB.prepare(`
    SELECT er.id as reservation_id,
           'EXTERNAL' as reservation_type,
           COALESCE(g.name, '外部予約') as reservation_name,
           es.name as location_name,
           er.start_time,
           er.end_time,
           gm.user_id as member_id
    FROM external_reservations er
    INNER JOIN group_member_instruments gm ON gm.group_id = er.group_id
    INNER JOIN external_studios es ON es.id = er.external_studio_id
    LEFT JOIN groups g ON g.id = er.group_id
    WHERE gm.user_id IN (${placeholders})
      AND er.state IN ('PENDING', 'CONFIRMED')
      AND er.start_time < ?
      AND er.end_time > ?
      ${excludeExternalReservationId ? 'AND er.id != ?' : ''}
  `).bind(
    ...memberIds,
    endTime,
    startTime,
    ...(excludeExternalReservationId ? [excludeExternalReservationId] : [])
  ).all<ConflictRow>();

  const seen = new Set<string>();
  return [
    ...hallGroupConflicts.results,
    ...hallPersonalConflicts.results,
    ...externalConflicts.results,
  ].map((row) => ({
    member_id: row.member_id,
    member_name: memberNames.get(row.member_id) || 'メンバー',
    reservation_id: row.reservation_id,
    reservation_type: row.reservation_type,
    reservation_name: row.reservation_name || '予約',
    location_name: row.location_name,
    start_time: row.start_time,
    end_time: row.end_time,
  })).filter((item) => {
    const key = `${item.member_id}:${item.reservation_id}:${item.reservation_type}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  }).map((item) => ExternalReservationConflictSchema.parse(item));
}

function notificationForStatus(state: ReservationState): EmailNotificationType | null {
  if (state === 'PENDING') return 'RESERVATION_RECEIVED';
  if (state === 'CONFIRMED') return 'RESERVATION_CONFIRMED';
  if (state === 'COMPLETED') return null;
  return 'RESERVATION_REVOKED';
}

async function getStartedExternalReservationResult(
  env: Bindings,
  externalStudioId: string,
  reservationId: string,
  startTime: string,
  endTime: string
) {
  const intervals = await getAvailableExternalIntervals(
    env,
    externalStudioId,
    startTime,
    endTime,
    reservationId
  );
  const startMs = new Date(startTime).getTime();
  const interval = intervals.find((item) => item.start.getTime() === startMs);
  if (!interval) return null;
  return interval.end.getTime() === new Date(endTime).getTime()
    ? { state: 'CONFIRMED' as const }
    : {
        state: 'CONFIRMED' as const,
        adjustedStartTime: startTime,
        adjustedEndTime: interval.end.toISOString(),
      };
}

async function isExternalReservationCancellable(
  env: Bindings,
  userId: string,
  reservation: { user_id: string; group_id: string; state: string }
): Promise<boolean> {
  if (!['PENDING', 'CONFIRMED'].includes(reservation.state)) {
    return false;
  }

  if (reservation.user_id === userId) {
    return true;
  }

  return await isUserInGroup(env, userId, reservation.group_id);
}

externalStudioRoutes.use('*', requireAuth);
externalReservationRoutes.use('*', requireAuth);

externalStudioRoutes.get('/studios', async (c) => {
  try {
    const externals = await c.env.DB.prepare(`
      SELECT id, name, start_datetime, end_datetime, created_at, updated_at
      FROM external_studios
      ORDER BY start_datetime ASC, name ASC
    `).all();

    return c.json({ success: true, data: externals.results.map((item) => ExternalSchema.parse(item)) });
  } catch (error) {
    console.error('Error fetching externals:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

externalStudioRoutes.post('/studios/bulk', async (c) => {
  try {
    const user = c.get('user');
    requireAdmin(user.role);

    const validatedData = CreateExternalRequestSchema.parse(await c.req.json());
    const normalizedNames = [...new Set(validatedData.names.map((name) => name.trim()).filter(Boolean))];
    if (normalizedNames.length === 0) {
      return c.json({ success: false, error: 'INVALID_REQUEST_DATA' }, 400);
    }

    const now = new Date().toISOString();
    for (const name of normalizedNames) {
      await c.env.DB.prepare(`
        INSERT INTO external_studios (id, name, start_datetime, end_datetime, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(crypto.randomUUID(), name, validatedData.start_datetime, validatedData.end_datetime, now, now).run();
    }

    await broadcastReservationRealtimeEvent(c.env, 'reservations_changed');
    return c.json({ success: true });
  } catch (error) {
    console.error('Error creating externals:', error);
    if (error instanceof Error && error.message === 'INSUFFICIENT_PERMISSIONS') {
      return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403);
    }
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

externalStudioRoutes.delete('/studios/:id', async (c) => {
  try {
    const user = c.get('user');
    requireAdmin(user.role);

    const externalId = parseUuid(c.req.param('id'));
    if (!externalId) {
      return c.json({ success: false, error: 'INVALID_INPUT' }, 400);
    }
    const external = await c.env.DB.prepare('SELECT id FROM external_studios WHERE id = ?').bind(externalId).first();
    if (!external) {
      return c.json({ success: false, error: 'EXTERNAL_NOT_FOUND' }, 404);
    }

    const affectedReservations = await c.env.DB.prepare(`
      SELECT id
      FROM external_reservations
      WHERE external_studio_id = ?
        AND state IN ('PENDING', 'CONFIRMED')
    `).bind(externalId).all<{ id: string }>();
    const preparedEmails = [];
    for (const reservation of affectedReservations.results) {
      try {
        preparedEmails.push(await prepareReservationEmail(c.env, {
          kind: 'EXTERNAL',
          reservationId: reservation.id,
          notificationType: 'RESERVATION_REVOKED',
          reservationStatusOverride: 'DECLINED',
        }));
      } catch (error) {
        console.error('External reservation email preparation failed before studio deletion', {
          reservationId: reservation.id,
          notificationType: 'RESERVATION_REVOKED',
          error: error instanceof Error ? error.message : 'UNKNOWN_EMAIL_ERROR',
        });
      }
    }

    await c.env.DB.prepare('DELETE FROM external_reservations WHERE external_studio_id = ?').bind(externalId).run();
    await c.env.DB.prepare('DELETE FROM external_studios WHERE id = ?').bind(externalId).run();
    await broadcastReservationRealtimeEvent(c.env, 'reservations_changed');

    c.executionCtx.waitUntil((async () => {
      for (const prepared of preparedEmails) {
        await sendPreparedReservationEmail(c.env, prepared);
      }
    })());

    return c.json({ success: true });
  } catch (error) {
    console.error('Error deleting external:', error);
    if (error instanceof Error && error.message === 'INSUFFICIENT_PERMISSIONS') {
      return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403);
    }
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

externalReservationRoutes.get('/', async (c) => {
  try {
    const user = c.get('user');
    const isAdminMode = c.req.query('admin') === 'true';

    if (isAdminMode) {
      try {
        requireAdmin(user.role);
      } catch {
        return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403);
      }
    }

    const query = `
      SELECT er.id, er.external_studio_id, es.name as external_name, er.user_id, er.group_id, er.start_time, er.end_time, er.state,
             COALESCE(u.nickname, u.name) as user_name,
             g.name as group_name,
             CASE
               WHEN er.state NOT IN ('PENDING', 'CONFIRMED') THEN 0
               ${isAdminMode ? 'ELSE 1' : `WHEN er.user_id = ? THEN 1
               WHEN EXISTS (
                 SELECT 1 FROM group_member_instruments gm
                 WHERE gm.group_id = er.group_id AND gm.user_id = ?
               ) THEN 1
               ELSE 0`}
             END as cancellable
      FROM external_reservations er
      INNER JOIN external_studios es ON es.id = er.external_studio_id
      LEFT JOIN users u ON er.user_id = u.id
      LEFT JOIN groups g ON er.group_id = g.id
      ${isAdminMode ? '' : `WHERE er.state IN ('PENDING', 'CONFIRMED')
        OR er.user_id = ?
        OR EXISTS (
          SELECT 1 FROM group_member_instruments gm
          WHERE gm.group_id = er.group_id AND gm.user_id = ?
        )`}
      ORDER BY er.start_time ASC
    `;

    const reservations = isAdminMode
      ? await c.env.DB.prepare(query).all()
      : await c.env.DB.prepare(query).bind(user.id, user.id, user.id, user.id).all();

    return c.json({ success: true, data: reservations.results.map((item) => ExternalReservationSchema.parse(item)) });
  } catch (error) {
    console.error('Error fetching external reservations:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

externalReservationRoutes.post('/check', async (c) => {
  try {
    const user = c.get('user');
    const data = CheckExternalReservationRequestSchema.parse(await c.req.json());
    const baseValidation = await validateExternalReservationBase(
      c.env,
      user.id,
      user.role,
      data.external_studio_id,
      data.group_id,
      data.start_time,
      data.end_time,
      false
    );
    if (baseValidation.error) {
      return c.json({ success: false, error: baseValidation.error }, baseValidation.status || 400);
    }

    const conflicts = await getMemberConflicts(c.env, data.group_id, data.start_time, data.end_time);
    return c.json({ success: true, data: conflicts });
  } catch (error) {
    console.error('Error checking external reservation:', error);
    if (error instanceof ZodError) {
      return c.json({ success: false, error: 'INVALID_INPUT' }, 400);
    }
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

externalReservationRoutes.post('/', async (c) => {
  try {
    const user = c.get('user');
    const data = CreateExternalReservationRequestSchema.parse(await c.req.json());
    const isAdminMode = data.admin === true;

    const baseValidation = await validateExternalReservationBase(
      c.env,
      user.id,
      user.role,
      data.external_studio_id,
      data.group_id,
      data.start_time,
      data.end_time,
      isAdminMode
    );
    if (baseValidation.error) {
      return c.json({ success: false, error: baseValidation.error }, baseValidation.status || 400);
    }

    const conflicts = await getMemberConflicts(c.env, data.group_id, data.start_time, data.end_time);
    if (conflicts.length > 0 && data.acknowledged_member_conflicts !== true) {
      return c.json({ success: false, error: 'MEMBER_RESERVATION_CONFLICT_WARNING', data: conflicts });
    }

    const now = new Date().toISOString();
    const reservationId = crypto.randomUUID();
    await c.env.DB.prepare(`
      INSERT INTO external_reservations (id, external_studio_id, user_id, group_id, start_time, end_time, state, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(reservationId, data.external_studio_id, user.id, data.group_id, data.start_time, data.end_time, 'PENDING', now, now).run();

    const processResult = await processExternalReservationState(c.env, data.external_studio_id, reservationId, data.start_time, data.end_time);
    let notificationType: EmailNotificationType = 'RESERVATION_RECEIVED';
    let requestedStartTime: string | undefined;
    let requestedEndTime: string | undefined;
    if (processResult.state !== 'PENDING') {
      const updateTime = new Date().toISOString();
      if (processResult.adjustedStartTime && processResult.adjustedEndTime) {
        notificationType = 'RESERVATION_ADJUSTED';
        requestedStartTime = data.start_time;
        requestedEndTime = data.end_time;
        await c.env.DB.prepare(`
          UPDATE external_reservations
          SET state = ?, start_time = ?, end_time = ?, updated_at = ?
          WHERE id = ?
        `).bind(processResult.state, processResult.adjustedStartTime, processResult.adjustedEndTime, updateTime, reservationId).run();
      } else {
        notificationType = processResult.state === 'CONFIRMED'
          ? 'RESERVATION_CONFIRMED'
          : 'RESERVATION_DECLINED';
        await c.env.DB.prepare(`
          UPDATE external_reservations
          SET state = ?, updated_at = ?
          WHERE id = ?
        `).bind(processResult.state, updateTime, reservationId).run();
      }
    }

    await broadcastReservationRealtimeEvent(c.env, 'reservations_changed');
    c.executionCtx.waitUntil(prepareAndSendReservationEmail(c.env, {
      kind: 'EXTERNAL',
      reservationId,
      notificationType,
      requestedStartTime,
      requestedEndTime,
    }));
    return c.json({ success: true });
  } catch (error) {
    console.error('Error creating external reservation:', error);
    if (error instanceof ZodError) {
      return c.json({ success: false, error: 'INVALID_INPUT' }, 400);
    }
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

externalReservationRoutes.put('/:id', async (c) => {
  try {
    const user = c.get('user');
    const reservationId = parseUuid(c.req.param('id'));
    if (!reservationId) {
      return c.json({ success: false, error: 'INVALID_INPUT' }, 400);
    }
    const data = UpdateExternalReservationRequestSchema.parse(await c.req.json());
    const isAdminMode = data.admin === true;
    if (isAdminMode) {
      try {
        requireAdmin(user.role);
      } catch {
        return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403);
      }
    }

    const reservation = await c.env.DB.prepare(`
      SELECT external_studio_id, user_id, group_id, start_time, end_time, state
      FROM external_reservations
      WHERE id = ?
    `).bind(reservationId).first<{
      external_studio_id: string;
      user_id: string;
      group_id: string;
      start_time: string;
      end_time: string;
      state: string;
    }>();
    if (!reservation) {
      return c.json({ success: false, error: 'RESERVATION_NOT_FOUND' }, 404);
    }
    if (!['PENDING', 'CONFIRMED'].includes(reservation.state)) {
      return c.json({ success: false, error: 'RESERVATION_CANNOT_BE_EDITED' }, 400);
    }
    if (!isAdminMode && !await isExternalReservationCancellable(c.env, user.id, reservation)) {
      return c.json({ success: false, error: 'RESERVATION_CANNOT_BE_EDITED' }, 403);
    }

    const now = new Date();
    const originalStart = new Date(reservation.start_time);
    const originalEnd = new Date(reservation.end_time);
    if (now >= originalEnd) {
      return c.json({ success: false, error: 'RESERVATION_CANNOT_BE_EDITED' }, 400);
    }
    const nextStart = new Date(data.start_time);
    const nextEnd = new Date(data.end_time);
    const isStarted = now >= originalStart;
    if (
      isStarted
      && (nextStart.getTime() !== originalStart.getTime()
        || getJSTDateString(nextStart) !== getJSTDateString(originalStart))
    ) {
      return c.json({ success: false, error: 'RESERVATION_START_CANNOT_BE_CHANGED' }, 400);
    }
    if (Number.isNaN(nextStart.getTime()) || Number.isNaN(nextEnd.getTime()) || nextEnd <= now) {
      return c.json({ success: false, error: 'RESERVATION_END_MUST_BE_IN_FUTURE' }, 400);
    }
    const normalizedStartTime = nextStart.toISOString();
    const normalizedEndTime = nextEnd.toISOString();

    const baseValidation = await validateExternalReservationBase(
      c.env,
      user.id,
      user.role,
      reservation.external_studio_id,
      reservation.group_id,
      normalizedStartTime,
      normalizedEndTime,
      isAdminMode,
      reservationId
    );
    if (baseValidation.error) {
      return c.json({ success: false, error: baseValidation.error }, baseValidation.status || 400);
    }

    const conflicts = await getMemberConflicts(
      c.env,
      reservation.group_id,
      normalizedStartTime,
      normalizedEndTime,
      reservationId
    );
    if (conflicts.length > 0 && data.acknowledged_member_conflicts !== true) {
      return c.json({
        success: false,
        error: 'MEMBER_RESERVATION_CONFLICT_WARNING',
        data: conflicts,
      });
    }

    const processResult = isStarted
      ? await getStartedExternalReservationResult(
          c.env,
          reservation.external_studio_id,
          reservationId,
          reservation.start_time,
          normalizedEndTime
        )
      : await processExternalReservationState(
          c.env,
          reservation.external_studio_id,
          reservationId,
          normalizedStartTime,
          normalizedEndTime
        );
    if (!processResult) {
      return c.json({ success: false, error: 'RESERVATION_CONFLICT' }, 409);
    }

    await c.env.DB.prepare(`
      UPDATE external_reservations
      SET start_time = ?, end_time = ?, state = ?, updated_at = ?
      WHERE id = ?
    `).bind(
      processResult.adjustedStartTime ?? normalizedStartTime,
      processResult.adjustedEndTime ?? normalizedEndTime,
      processResult.state,
      new Date().toISOString(),
      reservationId
    ).run();
    await broadcastReservationRealtimeEvent(c.env, 'reservations_changed');
    c.executionCtx.waitUntil(prepareAndSendReservationEmail(c.env, {
      kind: 'EXTERNAL',
      reservationId,
      notificationType: isAdminMode || processResult.adjustedStartTime || processResult.adjustedEndTime
        ? 'RESERVATION_ADJUSTED'
        : 'RESERVATION_EDITED',
      requestedStartTime: reservation.start_time,
      requestedEndTime: reservation.end_time,
    }));
    return c.json({ success: true });
  } catch (error) {
    console.error('Error updating external reservation:', error);
    if (error instanceof ZodError) {
      return c.json({ success: false, error: 'INVALID_INPUT' }, 400);
    }
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

externalReservationRoutes.put('/:id/status', async (c) => {
  try {
    const user = c.get('user');
    requireAdmin(user.role);
    const reservationId = parseUuid(c.req.param('id'));
    if (!reservationId) {
      return c.json({ success: false, error: 'INVALID_INPUT' }, 400);
    }
    const data = UpdateReservationStatusRequestSchema.parse(await c.req.json());
    const reservation = await c.env.DB.prepare(`
      SELECT external_studio_id, state, start_time, end_time
      FROM external_reservations
      WHERE id = ?
    `).bind(reservationId).first<{
      external_studio_id: string;
      state: ReservationState;
      start_time: string;
      end_time: string;
    }>();
    if (!reservation) {
      return c.json({ success: false, error: 'RESERVATION_NOT_FOUND' }, 404);
    }
    if (reservation.state === data.state) {
      return c.json({ success: true });
    }

    if (data.state === 'CONFIRMED') {
      const conflict = await c.env.DB.prepare(`
        SELECT id
        FROM external_reservations
        WHERE id != ?
          AND external_studio_id = ?
          AND state = 'CONFIRMED'
          AND start_time < ?
          AND end_time > ?
        LIMIT 1
      `).bind(
        reservationId,
        reservation.external_studio_id,
        reservation.end_time,
        reservation.start_time
      ).first();
      if (conflict) {
        return c.json({ success: false, error: 'RESERVATION_CONFLICT' }, 409);
      }
    }

    await c.env.DB.prepare(`
      UPDATE external_reservations SET state = ?, updated_at = ? WHERE id = ?
    `).bind(data.state, new Date().toISOString(), reservationId).run();
    await broadcastReservationRealtimeEvent(c.env, 'reservations_changed');
    const notificationType = notificationForStatus(data.state);
    if (notificationType) {
      c.executionCtx.waitUntil(prepareAndSendReservationEmail(c.env, {
        kind: 'EXTERNAL',
        reservationId,
        notificationType,
      }));
    }
    return c.json({ success: true });
  } catch (error) {
    console.error('Error updating external reservation status:', error);
    if (error instanceof ZodError) {
      return c.json({ success: false, error: 'INVALID_INPUT' }, 400);
    }
    if (error instanceof Error && error.message === 'INSUFFICIENT_PERMISSIONS') {
      return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403);
    }
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

externalReservationRoutes.post('/:id/cancel', async (c) => {
  try {
    const user = c.get('user');
    const reservationId = parseUuid(c.req.param('id'));
    if (!reservationId) {
      return c.json({ success: false, error: 'INVALID_INPUT' }, 400);
    }
    const isAdminMode = c.req.query('admin') === 'true';

    if (isAdminMode) {
      try {
        requireAdmin(user.role);
      } catch {
        return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403);
      }
    }

    const reservation = await c.env.DB.prepare(`
      SELECT user_id, group_id, state
      FROM external_reservations
      WHERE id = ?
    `).bind(reservationId).first<{ user_id: string; group_id: string; state: string }>();

    if (!reservation) {
      return c.json({ success: false, error: 'RESERVATION_NOT_FOUND' }, 404);
    }

    if (isAdminMode) {
      if (!['PENDING', 'CONFIRMED'].includes(reservation.state)) {
        return c.json({ success: false, error: 'RESERVATION_CANNOT_BE_CANCELLED' }, 400);
      }
    } else {
      const cancellable = await isExternalReservationCancellable(c.env, user.id, reservation);
      if (!cancellable) {
        return c.json({ success: false, error: 'RESERVATION_CANNOT_BE_CANCELLED' }, 403);
      }
    }

    await c.env.DB.prepare(`
      UPDATE external_reservations
      SET state = ?, updated_at = ?
      WHERE id = ?
    `).bind(isAdminMode ? 'DECLINED' : 'CANCELLED', new Date().toISOString(), reservationId).run();

    await broadcastReservationRealtimeEvent(c.env, 'reservations_changed');
    c.executionCtx.waitUntil(prepareAndSendReservationEmail(c.env, {
      kind: 'EXTERNAL',
      reservationId,
      notificationType: isAdminMode ? 'RESERVATION_REVOKED' : 'RESERVATION_CANCELLED',
    }));
    return c.json({ success: true });
  } catch (error) {
    console.error('Error cancelling external reservation:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

export { externalReservationRoutes, externalStudioRoutes };
