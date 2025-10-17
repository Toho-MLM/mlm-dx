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
      SELECT r.*, u.name as creator_name, g.name as group_name
      FROM reservations r
      LEFT JOIN users u ON r.creator = u.id
      LEFT JOIN groups g ON r.group_id = g.id
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
    const { start_time, end_time, group_id, notes } = await c.req.json();

    const now = new Date().toISOString();

    const result = await c.env.DB.prepare(`
      INSERT INTO reservations (creator, group_id, start_time, end_time, notes, state, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?)
    `).bind(user.id, group_id, start_time, end_time, notes, now, now).run();

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

    // Check if user owns the reservation
    const reservation = await c.env.DB.prepare(
      'SELECT * FROM reservations WHERE id = ? AND creator = ?'
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
      SELECT r.*, u.name as creator_name
      FROM reservations r
      LEFT JOIN users u ON r.creator = u.id
      WHERE r.group_id = ?
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
      SELECT r.*, g.name as group_name
      FROM reservations r
      LEFT JOIN groups g ON r.group_id = g.id
      WHERE r.creator = ?
      ORDER BY r.start_time ASC
    `).bind(user.id).all();

    return c.json({ success: true, data: reservations.results });
  } catch (error) {
    console.error('Error fetching user reservations:', error);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { reservationRoutes };