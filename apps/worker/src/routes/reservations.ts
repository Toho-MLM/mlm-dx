import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth';
import type { Bindings, Variables } from '../index';
import { isUserInGroup } from './groups';
import { CreateReservationRequestSchema, validateReservationTime, CreateUnavailablePeriodRequestSchema, UnavailablePeriodSchema, CreateReservationLimitRequestSchema, UpdateReservationLimitRequestSchema, ReservationLimitSchema, ReservationLimitRemainingSchema, isAdmin } from '../../../../lib/shared-schemas';
import { processReservationState, isTodayInJST, getJSTDateString, getJSTDayRange } from '../utils/reservation-processor';
import { requireAdmin } from '../utils/admin';

const reservationRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

type ReservationLimitScope = 'PERSONAL' | 'GROUP';
type ReservationLimitType = 'FIXED' | 'ROLLING';

type ReservationLimitRow = {
  id: string;
  scope: ReservationLimitScope;
  limit_type: ReservationLimitType;
  start_datetime: string | null;
  end_datetime: string | null;
  window_days: number | null;
  max_minutes: number;
};

async function isReservationCancellable(
  env: Bindings, 
  userId: string, 
  reservation: { user_id: string; group_id: string | null; state: string }
): Promise<boolean> {
  if (!['PENDING', 'CONFIRMED'].includes(reservation.state)) {
    return false;
  }
  
  if (reservation.user_id === userId) {
    return true;
  }
  
  if (reservation.group_id) {
    const isInGroup = await isUserInGroup(env, userId, reservation.group_id);
    if (isInGroup) {
      return true;
    }
  }
  
  return false;
}

function calculateOverlapMinutes(
  startTime: string,
  endTime: string,
  rangeStartTime: string,
  rangeEndTime: string
): number {
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();
  const rangeStart = new Date(rangeStartTime).getTime();
  const rangeEnd = new Date(rangeEndTime).getTime();
  const overlapStart = Math.max(start, rangeStart);
  const overlapEnd = Math.min(end, rangeEnd);

  if (overlapEnd <= overlapStart) {
    return 0;
  }

  return Math.ceil((overlapEnd - overlapStart) / (1000 * 60));
}

function getRollingWindow(referenceTime: string, windowDays: number): { startTime: string; endTime: string } {
  const end = new Date(referenceTime);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - windowDays);
  return {
    startTime: start.toISOString(),
    endTime: end.toISOString(),
  };
}

function getReferenceDayRange(referenceTime: string): { startTime: string; endTime: string } {
  const jstDateString = getJSTDateString(new Date(referenceTime));
  const { startUTC, endUTC } = getJSTDayRange(jstDateString);
  return {
    startTime: startUTC.toISOString(),
    endTime: endUTC.toISOString(),
  };
}

async function getUsedReservationMinutes(
  env: Bindings,
  scope: ReservationLimitScope,
  targetId: string,
  rangeStartTime: string,
  rangeEndTime: string
): Promise<number> {
  const reservations = scope === 'GROUP'
    ? await env.DB.prepare(`
        SELECT start_time, end_time
        FROM reservations
        WHERE group_id = ?
          AND state IN ('PENDING', 'CONFIRMED')
          AND start_time < ?
          AND end_time > ?
      `).bind(targetId, rangeEndTime, rangeStartTime).all<{ start_time: string; end_time: string }>()
    : await env.DB.prepare(`
        SELECT start_time, end_time
        FROM reservations
        WHERE user_id = ?
          AND group_id IS NULL
          AND state IN ('PENDING', 'CONFIRMED')
          AND start_time < ?
          AND end_time > ?
      `).bind(targetId, rangeEndTime, rangeStartTime).all<{ start_time: string; end_time: string }>();

  return reservations.results.reduce((total, reservation) => (
    total + calculateOverlapMinutes(
      reservation.start_time,
      reservation.end_time,
      rangeStartTime,
      rangeEndTime
    )
  ), 0);
}

async function hasReservationLimitConflict(
  env: Bindings,
  userId: string,
  groupId: string | null,
  startTime: string,
  endTime: string
): Promise<boolean> {
  const scope: ReservationLimitScope = groupId ? 'GROUP' : 'PERSONAL';
  const limits = await env.DB.prepare(`
    SELECT id, scope, limit_type, start_datetime, end_datetime, window_days, max_minutes
    FROM reservation_limits
    WHERE scope = ?
    ORDER BY start_datetime ASC
  `).bind(scope).all<ReservationLimitRow>();

  const targetId = groupId || userId;
  const newReservationMinutes = calculateOverlapMinutes(startTime, endTime, startTime, endTime);

  for (const limit of limits.results) {
    let rangeStartTime: string;
    let rangeEndTime: string;
    let newMinutesInRange = newReservationMinutes;

    if (limit.limit_type === 'FIXED') {
      if (!limit.start_datetime || !limit.end_datetime) {
        continue;
      }

      newMinutesInRange = calculateOverlapMinutes(startTime, endTime, limit.start_datetime, limit.end_datetime);
      rangeStartTime = limit.start_datetime;
      rangeEndTime = limit.end_datetime;
    } else {
      if (!limit.window_days) {
        continue;
      }

      const window = getRollingWindow(startTime, Number(limit.window_days));
      rangeStartTime = window.startTime;
      rangeEndTime = window.endTime;
    }

    if (newMinutesInRange === 0) {
      continue;
    }

    const usedMinutes = await getUsedReservationMinutes(env, scope, targetId, rangeStartTime, rangeEndTime);

    if (usedMinutes + newMinutesInRange > Number(limit.max_minutes)) {
      return true;
    }
  }

  return false;
}

async function hasOverlappingReservationLimit(
  env: Bindings,
  scope: ReservationLimitScope,
  limitType: ReservationLimitType,
  startDatetime: string,
  endDatetime: string,
  excludeId?: string
): Promise<boolean> {
  if (limitType !== 'FIXED') {
    return false;
  }

  const hasExcludeId = Boolean(excludeId);
  const existing = await env.DB.prepare(`
    SELECT id
    FROM reservation_limits
    WHERE scope = ?
      AND limit_type = 'FIXED'
      AND start_datetime < ?
      AND end_datetime > ?
      ${hasExcludeId ? 'AND id != ?' : ''}
    LIMIT 1
  `).bind(scope, endDatetime, startDatetime, ...(hasExcludeId ? [excludeId] : [])).first();

  return Boolean(existing);
}

async function hasDuplicateRollingReservationLimit(
  env: Bindings,
  scope: ReservationLimitScope,
  excludeId?: string
): Promise<boolean> {
  const hasExcludeId = Boolean(excludeId);
  const existing = await env.DB.prepare(`
    SELECT id
    FROM reservation_limits
    WHERE scope = ?
      AND limit_type = 'ROLLING'
      ${hasExcludeId ? 'AND id != ?' : ''}
    LIMIT 1
  `).bind(scope, ...(hasExcludeId ? [excludeId] : [])).first();

  return Boolean(existing);
}

async function getReservationLimitRemaining(
  env: Bindings,
  scope: ReservationLimitScope,
  targetId: string,
  referenceTime: string
) {
  const referenceDayRange = getReferenceDayRange(referenceTime);
  const limits = await env.DB.prepare(`
    SELECT id, scope, limit_type, start_datetime, end_datetime, window_days, max_minutes, created_at, updated_at
    FROM reservation_limits
    WHERE scope = ?
    ORDER BY start_datetime ASC
  `).bind(scope).all<ReservationLimitRow & { created_at: string; updated_at: string }>();

  const results = [];

  for (const limit of limits.results) {
    let rangeStartTime: string;
    let rangeEndTime: string;

    if (limit.limit_type === 'FIXED') {
      if (!limit.start_datetime || !limit.end_datetime) {
        continue;
      }

      const overlapsReferenceDay = limit.start_datetime < referenceDayRange.endTime && limit.end_datetime > referenceDayRange.startTime;
      if (!overlapsReferenceDay) {
        continue;
      }

      rangeStartTime = limit.start_datetime;
      rangeEndTime = limit.end_datetime;
    } else {
      if (!limit.window_days) {
        continue;
      }

      const window = getRollingWindow(referenceTime, Number(limit.window_days));
      rangeStartTime = window.startTime;
      rangeEndTime = window.endTime;
    }

    const usedMinutes = await getUsedReservationMinutes(env, scope, targetId, rangeStartTime, rangeEndTime);

    results.push(ReservationLimitRemainingSchema.parse({
      ...limit,
      used_minutes: usedMinutes,
      remaining_minutes: Math.max(0, Number(limit.max_minutes) - usedMinutes),
    }));
  }

  return results;
}

reservationRoutes.use('*', requireAuth);

reservationRoutes.get('/', async (c) => {
  try {
    const user = c.get('user');
    const adminParam = c.req.query('admin');
    const isAdminMode = adminParam === 'true';

    if (isAdminMode) {
      try {
        requireAdmin(user.role);
      } catch (error) {
        return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403);
      }
    }

    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    const twoWeeksAgoIso = twoWeeksAgo.toISOString();

    if (isAdminMode) {
      const reservations = await c.env.DB.prepare(`
        SELECT r.id, r.user_id, r.group_id, r.start_time, r.end_time, r.state,
               COALESCE(u.nickname, u.name) as user_name,
               ug.name as group_name,
               CASE 
                 WHEN r.state NOT IN ('PENDING', 'CONFIRMED') THEN 0
                 ELSE 1
               END as cancellable
        FROM reservations r
        LEFT JOIN users u ON r.user_id = u.id
        LEFT JOIN groups ug ON r.group_id = ug.id
        WHERE r.start_time >= ?
        ORDER BY r.start_time ASC
      `).bind(twoWeeksAgoIso).all();

      return c.json({ success: true, data: reservations.results });
    } else {
      const reservations = await c.env.DB.prepare(`
        SELECT r.id, r.user_id, r.group_id, r.start_time, r.end_time, r.state,
               COALESCE(u.nickname, u.name) as user_name,
               ug.name as group_name,
               CASE 
                 WHEN r.state NOT IN ('PENDING', 'CONFIRMED') THEN 0
                 WHEN r.user_id = ? THEN 1
                 WHEN r.group_id IS NOT NULL AND EXISTS (
                   SELECT 1 FROM group_member_instruments gm 
                   WHERE gm.group_id = r.group_id AND gm.user_id = ?
                 ) THEN 1
                 ELSE 0
               END as cancellable
        FROM reservations r
        LEFT JOIN users u ON r.user_id = u.id
        LEFT JOIN groups ug ON r.group_id = ug.id
        WHERE (r.state IN ('PENDING', 'CONFIRMED')
           OR (r.state NOT IN ('PENDING', 'CONFIRMED') AND r.user_id = ?))
           AND r.start_time >= ?
        ORDER BY r.start_time ASC
      `).bind(user.id, user.id, user.id, twoWeeksAgoIso).all();

      return c.json({ success: true, data: reservations.results });
    }
  } catch (error) {
    console.error('Error fetching reservations:', error);
    
    if (error instanceof Error && error.message === 'INSUFFICIENT_PERMISSIONS') {
      return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403);
    }
    
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});


reservationRoutes.post('/', async (c) => {
  try {
    const user = c.get('user');
    const requestData = await c.req.json();
    
    const validatedData = CreateReservationRequestSchema.parse(requestData);
    const { start_time, end_time, group_id, admin: isAdminMode } = validatedData;

    if (isAdminMode) {
      try {
        requireAdmin(user.role);
      } catch (error) {
        return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403);
      }
    }

    const validation = validateReservationTime(start_time, end_time);
    if (!validation.isValid) {
      return c.json({
        success: false,
        error: validation.error || 'INVALID_RESERVATION_TIME'
      }, 400);
    }

    if (group_id) {
      const groupExists = await c.env.DB.prepare(`
        SELECT 1 FROM groups WHERE id = ? AND is_active = TRUE
      `).bind(group_id).first();
      
      if (!groupExists) {
        return c.json({
          success: false,
          error: 'GROUP_NOT_FOUND'
        }, 400);
      }

      const isMember = isAdminMode || await isUserInGroup(c.env, user.id, group_id);
      if (!isMember) {
        return c.json({
          success: false,
          error: 'NOT_GROUP_MEMBER'
        }, 403);
      }
    }

    const unavailablePeriods = await c.env.DB.prepare(`
      SELECT start_datetime, end_datetime
      FROM unavailable_periods
      WHERE start_datetime < ? AND end_datetime > ?
    `).bind(end_time, start_time).all();

    if (!isAdminMode && unavailablePeriods.results.length > 0) {
      return c.json({
        success: false,
        error: 'BLOCKED_PERIOD_CONFLICT'
      }, 400);
    }

    const now = new Date().toISOString();
    const reservationId = crypto.randomUUID();

    const userId = user.id;
    const groupId = group_id || null;

    if (!isAdminMode) {
      const isLimitExceeded = await hasReservationLimitConflict(c.env, userId, groupId, start_time, end_time);
      if (isLimitExceeded) {
        return c.json({
          success: false,
          error: 'RESERVATION_LIMIT_EXCEEDED'
        }, 400);
      }
    }

    await c.env.DB.prepare(`
      INSERT INTO reservations (id, user_id, group_id, start_time, end_time, state, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(reservationId, userId, groupId, start_time, end_time, 'PENDING', now, now).run();

    const isSameDay = isTodayInJST(new Date(start_time));

    if (isSameDay) {
      const processResult = await processReservationState(c.env, reservationId, start_time, end_time);
      
      if (processResult.state !== 'PENDING') {
        const updateTime = new Date().toISOString();
        
        if (processResult.adjustedStartTime && processResult.adjustedEndTime) {
          await c.env.DB.prepare(`
            UPDATE reservations 
            SET state = ?, start_time = ?, end_time = ?, updated_at = ?
            WHERE id = ?
          `).bind(
            processResult.state, 
            processResult.adjustedStartTime, 
            processResult.adjustedEndTime, 
            updateTime, 
            reservationId
          ).run();
        } else {
          await c.env.DB.prepare(`
            UPDATE reservations 
            SET state = ?, updated_at = ?
            WHERE id = ?
          `).bind(processResult.state, updateTime, reservationId).run();
        }
      }
    }

    return c.json({ success: true });
  } catch (error) {
    console.error('Error creating reservation:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('UNIQUE constraint failed')) {
        return c.json({ success: false, error: 'RESERVATION_CONFLICT' }, 409);
      }
      if (error.message.includes('FOREIGN KEY constraint failed')) {
        return c.json({ success: false, error: 'INVALID_USER_OR_GROUP' }, 400);
      }
    }
    
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

reservationRoutes.get('/limits', async (c) => {
  try {
    const limits = await c.env.DB.prepare(`
      SELECT id, scope, limit_type, start_datetime, end_datetime, window_days, max_minutes, created_at, updated_at
      FROM reservation_limits
      ORDER BY start_datetime ASC
    `).all();

    const validatedLimits = limits.results.map(limit => 
      ReservationLimitSchema.parse(limit)
    );

    return c.json({ success: true, data: validatedLimits });
  } catch (error) {
    console.error('Error fetching reservation limits:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

reservationRoutes.get('/limits/remaining', async (c) => {
  try {
    const user = c.get('user');
    const scope = c.req.query('scope');
    const targetId = c.req.query('target_id');
    const referenceTime = c.req.query('reference_time') || new Date().toISOString();

    if ((scope !== 'PERSONAL' && scope !== 'GROUP') || !targetId || Number.isNaN(new Date(referenceTime).getTime())) {
      return c.json({ success: false, error: 'INVALID_PARAMETERS' }, 400);
    }

    if (!isAdmin(user.role)) {
      if (scope === 'PERSONAL' && targetId !== user.id) {
        return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403);
      }

      if (scope === 'GROUP') {
        const isMember = await isUserInGroup(c.env, user.id, targetId);
        if (!isMember) {
          return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403);
        }
      }
    }

    const remaining = await getReservationLimitRemaining(c.env, scope, targetId, referenceTime);

    return c.json({ success: true, data: remaining });
  } catch (error) {
    console.error('Error fetching reservation limit remaining:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

reservationRoutes.post('/limits', async (c) => {
  try {
    const user = c.get('user');
    requireAdmin(user.role);

    const requestData = await c.req.json();
    const validatedData = CreateReservationLimitRequestSchema.parse(requestData);
    const { scope, limit_type, start_datetime, end_datetime, window_days, max_minutes } = validatedData;

    const isOverlapping = limit_type === 'FIXED' && start_datetime && end_datetime
      ? await hasOverlappingReservationLimit(c.env, scope, limit_type, start_datetime, end_datetime)
      : false;
    if (isOverlapping) {
      return c.json({ success: false, error: 'RESERVATION_LIMIT_OVERLAP' }, 400);
    }

    const isDuplicateRolling = limit_type === 'ROLLING'
      ? await hasDuplicateRollingReservationLimit(c.env, scope)
      : false;
    if (isDuplicateRolling) {
      return c.json({ success: false, error: 'RESERVATION_LIMIT_OVERLAP' }, 400);
    }

    const now = new Date().toISOString();
    const limitId = crypto.randomUUID();

    await c.env.DB.prepare(`
      INSERT INTO reservation_limits (id, scope, limit_type, start_datetime, end_datetime, window_days, max_minutes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      limitId,
      scope,
      limit_type,
      limit_type === 'FIXED' ? start_datetime || null : null,
      limit_type === 'FIXED' ? end_datetime || null : null,
      limit_type === 'ROLLING' ? window_days || null : null,
      max_minutes,
      now,
      now
    ).run();

    return c.json({ success: true });
  } catch (error) {
    console.error('Error creating reservation limit:', error);
    
    if (error instanceof Error && error.message === 'INSUFFICIENT_PERMISSIONS') {
      return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403);
    }
    
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

reservationRoutes.put('/limits/:id', async (c) => {
  try {
    const user = c.get('user');
    requireAdmin(user.role);

    const limitId = c.req.param('id');
    const requestData = await c.req.json();
    const validatedData = UpdateReservationLimitRequestSchema.parse(requestData);
    const { scope, limit_type, start_datetime, end_datetime, window_days, max_minutes } = validatedData;

    const existingLimit = await c.env.DB.prepare(
      'SELECT id FROM reservation_limits WHERE id = ?'
    ).bind(limitId).first();

    if (!existingLimit) {
      return c.json({ success: false, error: 'RESERVATION_LIMIT_NOT_FOUND' }, 404);
    }

    const isOverlapping = limit_type === 'FIXED' && start_datetime && end_datetime
      ? await hasOverlappingReservationLimit(c.env, scope, limit_type, start_datetime, end_datetime, limitId)
      : false;
    if (isOverlapping) {
      return c.json({ success: false, error: 'RESERVATION_LIMIT_OVERLAP' }, 400);
    }

    const isDuplicateRolling = limit_type === 'ROLLING'
      ? await hasDuplicateRollingReservationLimit(c.env, scope, limitId)
      : false;
    if (isDuplicateRolling) {
      return c.json({ success: false, error: 'RESERVATION_LIMIT_OVERLAP' }, 400);
    }

    const now = new Date().toISOString();

    await c.env.DB.prepare(`
      UPDATE reservation_limits
      SET scope = ?, limit_type = ?, start_datetime = ?, end_datetime = ?, window_days = ?, max_minutes = ?, updated_at = ?
      WHERE id = ?
    `).bind(
      scope,
      limit_type,
      limit_type === 'FIXED' ? start_datetime || null : null,
      limit_type === 'FIXED' ? end_datetime || null : null,
      limit_type === 'ROLLING' ? window_days || null : null,
      max_minutes,
      now,
      limitId
    ).run();

    return c.json({ success: true });
  } catch (error) {
    console.error('Error updating reservation limit:', error);
    
    if (error instanceof Error && error.message === 'INSUFFICIENT_PERMISSIONS') {
      return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403);
    }
    
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

reservationRoutes.delete('/limits/:id', async (c) => {
  try {
    const user = c.get('user');
    requireAdmin(user.role);

    const limitId = c.req.param('id');

    const existingLimit = await c.env.DB.prepare(
      'SELECT id FROM reservation_limits WHERE id = ?'
    ).bind(limitId).first();

    if (!existingLimit) {
      return c.json({ success: false, error: 'RESERVATION_LIMIT_NOT_FOUND' }, 404);
    }

    await c.env.DB.prepare(
      'DELETE FROM reservation_limits WHERE id = ?'
    ).bind(limitId).run();

    return c.json({ success: true });
  } catch (error) {
    console.error('Error deleting reservation limit:', error);
    
    if (error instanceof Error && error.message === 'INSUFFICIENT_PERMISSIONS') {
      return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403);
    }
    
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

reservationRoutes.get('/unavailable', async (c) => {
  try {
    const unavailablePeriods = await c.env.DB.prepare(`
      SELECT id, start_datetime, end_datetime, reason, created_at, updated_at
      FROM unavailable_periods
      ORDER BY start_datetime ASC
    `).all();

    const validatedPeriods = unavailablePeriods.results.map(period => 
      UnavailablePeriodSchema.parse(period)
    );

    return c.json({ success: true, data: validatedPeriods });
  } catch (error) {
    console.error('Error fetching unavailable periods:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

reservationRoutes.post('/unavailable', async (c) => {
  try {
    const user = c.get('user');
    requireAdmin(user.role);

    const requestData = await c.req.json();
    const validatedData = CreateUnavailablePeriodRequestSchema.parse(requestData);
    const { start_datetime, end_datetime, reason } = validatedData;

    const conflictingReservations = await c.env.DB.prepare(`
      SELECT id, start_time, end_time
      FROM reservations
      WHERE state IN ('PENDING', 'CONFIRMED')
        AND start_time < ? AND end_time > ?
    `).bind(end_datetime, start_datetime).all();

    if (conflictingReservations.results.length > 0) {
      return c.json({
        success: false,
        error: 'RESERVATION_CONFLICT'
      }, 400);
    }

    const now = new Date().toISOString();
    const periodId = crypto.randomUUID();

    await c.env.DB.prepare(`
      INSERT INTO unavailable_periods (id, start_datetime, end_datetime, reason, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(periodId, start_datetime, end_datetime, reason || null, now, now).run();

    return c.json({ success: true });
  } catch (error) {
    console.error('Error creating unavailable period:', error);
    
    if (error instanceof Error) {
      if (error.message === 'INSUFFICIENT_PERMISSIONS') {
        return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403);
      }
    }
    
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

reservationRoutes.delete('/unavailable/:id', async (c) => {
  try {
    const user = c.get('user');
    requireAdmin(user.role);

    const periodId = c.req.param('id');

    const period = await c.env.DB.prepare(
      'SELECT id FROM unavailable_periods WHERE id = ?'
    ).bind(periodId).first();

    if (!period) {
      return c.json({ success: false, error: 'UNAVAILABLE_PERIOD_NOT_FOUND' }, 404);
    }

    await c.env.DB.prepare(
      'DELETE FROM unavailable_periods WHERE id = ?'
    ).bind(periodId).run();

    return c.json({ success: true });
  } catch (error) {
    console.error('Error deleting unavailable period:', error);
    
    if (error instanceof Error) {
      if (error.message === 'INSUFFICIENT_PERMISSIONS') {
        return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403);
      }
    }
    
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

reservationRoutes.post('/:id/cancel', async (c) => {
  try {
    const user = c.get('user');
    const reservationId = c.req.param('id');
    const adminParam = c.req.query('admin');
    const isAdminMode = adminParam === 'true';

    if (isAdminMode) {
      try {
        requireAdmin(user.role);
      } catch (error) {
        return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403);
      }
    }

    const reservation = await c.env.DB.prepare(
      'SELECT user_id, group_id, state FROM reservations WHERE id = ?'
    ).bind(reservationId).first<{ user_id: string; group_id: string | null; state: string }>();

    if (!reservation) {
      return c.json({ success: false, error: 'RESERVATION_NOT_FOUND' }, 404);
    }

    if (isAdminMode) {
      if (!['PENDING', 'CONFIRMED'].includes(reservation.state)) {
        return c.json({ success: false, error: 'RESERVATION_CANNOT_BE_CANCELLED' }, 400);
      }

      const now = new Date().toISOString();

      await c.env.DB.prepare(
        'UPDATE reservations SET state = ?, updated_at = ? WHERE id = ?'
      ).bind('DECLINED', now, reservationId).run();

      return c.json({ success: true });
    } else {
      const cancellable = await isReservationCancellable(c.env, user.id, reservation);
      if (!cancellable) {
        return c.json({ success: false, error: 'RESERVATION_CANNOT_BE_CANCELLED' }, 403);
      }

      const now = new Date().toISOString();

      await c.env.DB.prepare(
        'UPDATE reservations SET state = ?, updated_at = ? WHERE id = ?'
      ).bind('CANCELLED', now, reservationId).run();

      return c.json({ success: true });
    }
  } catch (error) {
    console.error('Error cancelling reservation:', error);
    
    if (error instanceof Error && error.message === 'INSUFFICIENT_PERMISSIONS') {
      return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403);
    }
    
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});



export { reservationRoutes };
