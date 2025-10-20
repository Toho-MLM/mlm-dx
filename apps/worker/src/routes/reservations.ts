import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth';
import { Bindings } from '../index';

const reservationRoutes = new Hono<{ Bindings: Bindings }>();

// Apply authentication middleware to all routes
reservationRoutes.use('*', requireAuth);

// fetch_reservations - Get all reservations
reservationRoutes.get('/fetch', async (c) => {
  try {
    const reservations = await c.env.DB.prepare(`
      SELECT r.*, u.name as booked_by_name, ug.name as holder_group_name
      FROM reservations r
      LEFT JOIN users u ON r.booked_by = u.id
      LEFT JOIN groups ug ON r.holder_group_id = ug.id
      ORDER BY r.start_time ASC
    `).all();

    return c.json({ success: true, data: reservations.results });
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

    return c.json({ 
      success: true, 
      data: { id: result.meta.last_row_id },
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
      'SELECT * FROM reservations WHERE id = ? AND booked_by = ?'
    ).bind(reservationId, user.id).first();

    if (!reservation) {
      return c.json({ success: false, error: 'Reservation not found or unauthorized' }, 404);
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

    const reservations = await c.env.DB.prepare(`
      SELECT r.*, u.name as booked_by_name
      FROM reservations r
      LEFT JOIN users u ON r.booked_by = u.id
      WHERE r.holder_group_id = ?
      ORDER BY r.start_time ASC
    `).bind(groupId).all();

    return c.json({ success: true, data: reservations.results });
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
      SELECT r.*, g.name as holder_group_name
      FROM reservations r
      LEFT JOIN groups g ON r.holder_group_id = g.id
      WHERE r.holder_user_id = ?
      ORDER BY r.start_time ASC
    `).bind(user.id).all();

    return c.json({ success: true, data: reservations.results });
  } catch (error) {
    console.error('Error fetching user reservations:', error);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { reservationRoutes };