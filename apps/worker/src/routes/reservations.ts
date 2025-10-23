import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth';
import type { Bindings, Variables } from '../index';
import { isUserInGroup, getUserGroupIds } from './groups';

const reservationRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Helper function to check if a reservation is cancellable by a user
async function isReservationCancellable(
  env: Bindings, 
  userId: string, 
  reservation: { booked_by: string; holder_user_id: string | null; holder_group_id: string | null; state: string }
): Promise<boolean> {
  // Check if reservation is in cancellable state
  if (!['PENDING', 'CONFIRMED'].includes(reservation.state)) {
    return false;
  }
  
  // Check if user is the creator
  if (reservation.booked_by === userId) {
    return true;
  }
  
  // Check if user is the holder
  if (reservation.holder_user_id === userId) {
    return true;
  }
  
  // Check if user belongs to the holder group
  if (reservation.holder_group_id) {
    const isInGroup = await isUserInGroup(env, userId, reservation.holder_group_id);
    if (isInGroup) {
      return true;
    }
  }
  
  return false;
}

// Apply authentication middleware to all routes
reservationRoutes.use('*', requireAuth);

// fetch_reservations - Get all reservations
reservationRoutes.get('/fetch', async (c) => {
  try {
    const user = c.get('user');
    
    const reservations = await c.env.DB.prepare(`
      SELECT r.id, r.booked_by, r.holder_user_id, r.holder_group_id, r.start_time, r.end_time, r.state,
             u.name as booked_by_name,
             CASE 
               WHEN r.holder_user_id IS NOT NULL THEN uh.nickname
               WHEN r.holder_group_id IS NOT NULL THEN ug.name
               ELSE NULL
             END as creator_name,
             ug.name as holder_group_name
      FROM reservations r
      LEFT JOIN users u ON r.booked_by = u.id
      LEFT JOIN users uh ON r.holder_user_id = uh.id
      LEFT JOIN groups ug ON r.holder_group_id = ug.id
      ORDER BY r.start_time ASC
    `).all();

    // Add cancellable field for each reservation
    const reservationsWithCancellable = await Promise.all(
      reservations.results.map(async (reservation: any) => {
        const cancellable = await isReservationCancellable(c.env, user.id, reservation);
        return {
          ...reservation,
          cancellable: cancellable ? 1 : 0
        };
      })
    );

    return c.json({ success: true, data: reservationsWithCancellable });
  } catch (error) {
    console.error('Error fetching reservations:', error);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// create_reservation - Create a new reservation
reservationRoutes.post('/create', async (c) => {
  try {
    const user = c.get('user');
    const { start_time, end_time, holder_user_id, holder_group_id } = await c.req.json();

    const now = new Date().toISOString();

    const result = await c.env.DB.prepare(`
      INSERT INTO reservations (booked_by, holder_user_id, holder_group_id, start_time, end_time, state, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?)
    `).bind(user.id, holder_user_id ?? null, holder_group_id ?? null, start_time, end_time, now, now).run();

    const createdReservation = await c.env.DB.prepare(`
      SELECT r.id, r.booked_by, r.holder_user_id, r.holder_group_id, r.start_time, r.end_time, r.state,
             u.name as booked_by_name,
             CASE 
               WHEN r.holder_user_id IS NOT NULL THEN uh.nickname
               WHEN r.holder_group_id IS NOT NULL THEN ug.name
               ELSE NULL
             END as creator_name,
             ug.name as holder_group_name
      FROM reservations r
      LEFT JOIN users u ON r.booked_by = u.id
      LEFT JOIN users uh ON r.holder_user_id = uh.id
      LEFT JOIN groups ug ON r.holder_group_id = ug.id
      WHERE r.id = ?
    `).bind(result.meta.last_row_id).first();

    // Add cancellable field
    const cancellable = await isReservationCancellable(c.env, user.id, createdReservation as any);
    const reservationWithCancellable = {
      ...createdReservation,
      cancellable: cancellable ? 1 : 0
    };

    return c.json({ 
      success: true, 
      data: reservationWithCancellable,
      message: 'Reservation created successfully' 
    });
  } catch (error) {
    console.error('Error creating reservation:', error);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// cancel_reservation - Cancel a reservation
reservationRoutes.put('/cancel/:id', async (c) => {
  try {
    const user = c.get('user');
    const reservationId = c.req.param('id');

    const reservation = await c.env.DB.prepare(
      'SELECT * FROM reservations WHERE id = ?'
    ).bind(reservationId).first();

    if (!reservation) {
      return c.json({ success: false, error: 'Reservation not found' }, 404);
    }

    // Check if reservation is cancellable by this user
    const cancellable = await isReservationCancellable(c.env, user.id, reservation as any);
    if (!cancellable) {
      return c.json({ success: false, error: 'Reservation cannot be cancelled by this user' }, 403);
    }

    const now = new Date().toISOString();

    await c.env.DB.prepare(
      'UPDATE reservations SET state = ?, updated_at = ? WHERE id = ?'
    ).bind('CANCELLED', now, reservationId).run();

    return c.json({ success: true, message: 'Reservation cancelled successfully' });
  } catch (error) {
    console.error('Error cancelling reservation:', error);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// Get reservations by group
reservationRoutes.get('/group/:groupId', async (c) => {
  try {
    const groupId = c.req.param('groupId');
    const user = c.get('user');
    
    const reservations = await c.env.DB.prepare(`
      SELECT r.id, r.booked_by, r.holder_user_id, r.holder_group_id, r.start_time, r.end_time, r.state,
             u.name as booked_by_name,
             CASE 
               WHEN r.holder_user_id IS NOT NULL THEN uh.nickname
               WHEN r.holder_group_id IS NOT NULL THEN ug.name
               ELSE NULL
             END as creator_name,
             ug.name as holder_group_name
      FROM reservations r
      LEFT JOIN users u ON r.booked_by = u.id
      LEFT JOIN users uh ON r.holder_user_id = uh.id
      LEFT JOIN groups ug ON r.holder_group_id = ug.id
      WHERE r.holder_group_id = ?
      ORDER BY r.start_time ASC
    `).bind(groupId).all();

    // Add cancellable field for each reservation
    const reservationsWithCancellable = await Promise.all(
      reservations.results.map(async (reservation: any) => {
        const cancellable = await isReservationCancellable(c.env, user.id, reservation);
        return {
          ...reservation,
          cancellable: cancellable ? 1 : 0
        };
      })
    );

    return c.json({ success: true, data: reservationsWithCancellable });
  } catch (error) {
    console.error('Error fetching group reservations:', error);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// Get reservations by user
reservationRoutes.get('/user', async (c) => {
  try {
    const user = c.get('user');
    
    const reservations = await c.env.DB.prepare(`
      SELECT r.id, r.booked_by, r.holder_user_id, r.holder_group_id, r.start_time, r.end_time, r.state,
             u.name as booked_by_name,
             CASE 
               WHEN r.holder_user_id IS NOT NULL THEN uh.nickname
               WHEN r.holder_group_id IS NOT NULL THEN ug.name
               ELSE NULL
             END as creator_name,
             ug.name as holder_group_name
      FROM reservations r
      LEFT JOIN users u ON r.booked_by = u.id
      LEFT JOIN users uh ON r.holder_user_id = uh.id
      LEFT JOIN groups ug ON r.holder_group_id = ug.id
      WHERE r.holder_user_id = ?
      ORDER BY r.start_time ASC
    `).bind(user.id).all();

    // Add cancellable field for each reservation
    const reservationsWithCancellable = await Promise.all(
      reservations.results.map(async (reservation: any) => {
        const cancellable = await isReservationCancellable(c.env, user.id, reservation);
        return {
          ...reservation,
          cancellable: cancellable ? 1 : 0
        };
      })
    );

    return c.json({ success: true, data: reservationsWithCancellable });
  } catch (error) {
    console.error('Error fetching user reservations:', error);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { reservationRoutes };