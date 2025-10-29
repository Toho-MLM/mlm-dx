import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth';
import type { Bindings, Variables } from '../index';
import { isUserInGroup, getUserGroupIds } from './groups';
import { CreateReservationRequestSchema, validateReservationTime } from '../../../../lib/shared-schemas';
import { processReservationState } from '../utils/reservation-processor';

const reservationRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Helper function to check if a reservation is cancellable by a user
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

// Apply authentication middleware to all routes
reservationRoutes.use('*', requireAuth);

// fetch_reservations - Get all reservations
reservationRoutes.get('/', async (c) => {
  try {
    const user = c.get('user');
    
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    const twoWeeksAgoIso = twoWeeksAgo.toISOString();
    
    const reservations = await c.env.DB.prepare(`
      SELECT r.id, r.user_id, r.group_id, r.start_time, r.end_time, r.state,
             u.name as user_name,
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
         OR r.user_id = ?
         OR (r.group_id IS NOT NULL AND EXISTS (
           SELECT 1 FROM group_member_instruments gm 
           WHERE gm.group_id = r.group_id AND gm.user_id = ?
         )))
         AND r.start_time >= ?
      ORDER BY r.start_time ASC
    `).bind(user.id, user.id, user.id, user.id, twoWeeksAgoIso).all();

    return c.json({ success: true, data: reservations.results });
  } catch (error) {
    console.error('Error fetching reservations:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});


// create_reservation - Create a new reservation
reservationRoutes.post('/', async (c) => {
  try {
    const user = c.get('user');
    const requestData = await c.req.json();
    
    // 共通スキーマでバリデーション
    const validatedData = CreateReservationRequestSchema.parse(requestData);
    const { start_time, end_time, group_id } = validatedData;

    // 追加のバリデーション
    const validation = validateReservationTime(start_time, end_time);
    if (!validation.isValid) {
      return c.json({
        success: false,
        error: validation.error || 'INVALID_RESERVATION_TIME'
      }, 400);
    }

    // グループIDのバリデーション（group_idが指定されている場合）
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

      // ユーザーがそのグループのメンバーかチェック
      const isMember = await isUserInGroup(c.env, user.id, group_id);
      if (!isMember) {
        return c.json({
          success: false,
          error: 'NOT_GROUP_MEMBER'
        }, 403);
      }
    }

    const now = new Date().toISOString();
    const reservationId = crypto.randomUUID();

    // Determine user_id and group_id based on group_id
    const userId = user.id;
    const groupId = group_id || null;

    // 当日予約かどうかをチェック
    const isSameDay = new Date(start_time).toDateString() === new Date().toDateString();

    // 当日予約の場合は重複チェックを先に実行してから挿入
    let finalState = 'PENDING';
    let adjustedStartTime = start_time;
    let adjustedEndTime = end_time;
    let processResult = null;

    if (isSameDay) {
      // 仮のIDで重複チェックを実行（実際の挿入前）
      processResult = await processReservationState(c.env, 0, start_time, end_time);
      finalState = processResult.state;
      
      if (processResult.adjustedStartTime && processResult.adjustedEndTime) {
        adjustedStartTime = processResult.adjustedStartTime;
        adjustedEndTime = processResult.adjustedEndTime;
      }
    }

    // 1回の書き込みで予約を作成（最終的な状態で）
    await c.env.DB.prepare(`
      INSERT INTO reservations (id, user_id, group_id, start_time, end_time, state, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(reservationId, userId, groupId, adjustedStartTime, adjustedEndTime, finalState, now, now).run();

    return c.json({ success: true });
  } catch (error) {
    console.error('Error creating reservation:', error);
    
    // より具体的なエラーメッセージ
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

// cancel_reservation - Cancel a reservation
reservationRoutes.post('/:id/cancel', async (c) => {
  try {
    const user = c.get('user');
    const reservationId = c.req.param('id');

    const reservation = await c.env.DB.prepare(
      'SELECT * FROM reservations WHERE id = ?'
    ).bind(reservationId).first();

    if (!reservation) {
      return c.json({ success: false, error: 'RESERVATION_NOT_FOUND' }, 404);
    }

    // Check if reservation is cancellable by this user
    const cancellable = await isReservationCancellable(c.env, user.id, reservation as any);
    if (!cancellable) {
      return c.json({ success: false, error: 'RESERVATION_CANNOT_BE_CANCELLED' }, 403);
    }

    const now = new Date().toISOString();

    await c.env.DB.prepare(
      'UPDATE reservations SET state = ?, updated_at = ? WHERE id = ?'
    ).bind('CANCELLED', now, reservationId).run();

    return c.json({ success: true });
  } catch (error) {
    console.error('Error cancelling reservation:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});



export { reservationRoutes };