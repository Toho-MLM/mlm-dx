import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth';
import type { Bindings, Variables } from '../index';
import { isUserInGroup } from './groups';
import { CreateReservationRequestSchema, validateReservationTime, CreateUnavailablePeriodRequestSchema, UnavailablePeriodSchema } from '../../../../lib/shared-schemas';
import { processReservationState, isTodayInJST } from '../utils/reservation-processor';
import { requireAdmin } from '../utils/admin';

const reservationRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

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
    const { start_time, end_time, group_id } = validatedData;

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

      const isMember = await isUserInGroup(c.env, user.id, group_id);
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

    if (unavailablePeriods.results.length > 0) {
      return c.json({
        success: false,
        error: 'BLOCKED_PERIOD_CONFLICT'
      }, 400);
    }

    const now = new Date().toISOString();
    const reservationId = crypto.randomUUID();

    const userId = user.id;
    const groupId = group_id || null;

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