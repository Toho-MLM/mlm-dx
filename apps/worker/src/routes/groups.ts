import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth';
import { Bindings } from '../index';

const groupRoutes = new Hono<{ Bindings: Bindings }>();

// Apply authentication middleware to all routes
groupRoutes.use('*', requireAuth);

// upsert_group - Create or update a group
groupRoutes.post('/upsert', async (c) => {
  try {
    const { id, name, is_main = false } = await c.req.json();

    const now = new Date().toISOString();

    if (id) {
      // Update existing group
      await c.env.DB.prepare(`
        UPDATE groups 
        SET name = ?, is_main = ?, updated_at = ?
        WHERE id = ?
      `).bind(name, is_main, now, id).run();
    } else {
      // Create new group
      const newId = crypto.randomUUID();
      await c.env.DB.prepare(`
        INSERT INTO groups (id, name, is_main, is_active, created_at, updated_at)
        VALUES (?, ?, ?, TRUE, ?, ?)
      `).bind(newId, name, is_main, now, now).run();
      
      return c.json({ 
        success: true, 
        data: { id: newId },
        message: 'Group created successfully' 
      });
    }

    return c.json({ success: true, message: 'Group updated successfully' });
  } catch (error) {
    console.error('Error upserting group:', error);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// Get all groups
groupRoutes.get('/', async (c) => {
  try {
    const groups = await c.env.DB.prepare(`
      SELECT g.*, COUNT(DISTINCT gmi.user_id) as member_count
      FROM groups g
      LEFT JOIN group_member_instruments gmi ON g.id = gmi.group_id
      WHERE g.is_active = TRUE
      GROUP BY g.id
      ORDER BY g.name ASC
    `).all();

    return c.json({ success: true, data: groups.results });
  } catch (error) {
    console.error('Error fetching groups:', error);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// Get group by ID
groupRoutes.get('/:id', async (c) => {
  try {
    const groupId = c.req.param('id');

    const group = await c.env.DB.prepare(
      'SELECT * FROM groups WHERE id = ? AND is_active = TRUE'
    ).bind(groupId).first();

    if (!group) {
      return c.json({ success: false, error: 'Group not found' }, 404);
    }

    return c.json({ success: true, data: group });
  } catch (error) {
    console.error('Error fetching group:', error);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// Update group
groupRoutes.put('/:id', async (c) => {
  try {
    const groupId = c.req.param('id');
    const { name, is_main, is_active } = await c.req.json();

    const now = new Date().toISOString();

    await c.env.DB.prepare(`
      UPDATE groups 
      SET name = ?, is_main = ?, is_active = ?, updated_at = ?
      WHERE id = ?
    `).bind(name, is_main, is_active, now, groupId).run();

    return c.json({ success: true, message: 'Group updated successfully' });
  } catch (error) {
    console.error('Error updating group:', error);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// Get mapping: user_id -> instruments[] for a group
groupRoutes.get('/:id/member-instruments', async (c) => {
  try {
    const groupId = c.req.param('id');

    const rows = await c.env.DB.prepare(
      'SELECT user_id, instrument FROM group_member_instruments WHERE group_id = ? ORDER BY user_id'
    ).bind(groupId).all();

    const mapping: Record<string, ('VO' | 'GT' | 'KEY' | 'DR' | 'BA')[]> = {};
    for (const row of rows.results as { user_id: string; instrument: string }[]) {
      const uid = row.user_id;
      const inst = row.instrument as 'VO' | 'GT' | 'KEY' | 'DR' | 'BA';
      if (!mapping[uid]) mapping[uid] = [];
      if (!mapping[uid].includes(inst)) mapping[uid].push(inst);
    }

    return c.json({ success: true, data: mapping });
  } catch (error) {
    console.error('Error fetching member instruments:', error);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// Add a single instrument assignment for a user in a group
groupRoutes.post('/:id/member-instruments', async (c) => {
  try {
    const groupId = c.req.param('id');
    const { user_id, instrument } = await c.req.json<{ user_id: string; instrument: string }>();

    const valid = ['VO','GT','KEY','DR','BA'] as const;
    if (!user_id || !instrument || !valid.includes(instrument as typeof valid[number])) {
      return c.json({ success: false, error: 'Invalid parameters' }, 400);
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await c.env.DB.prepare(
      'INSERT OR IGNORE INTO group_member_instruments (id, group_id, user_id, instrument, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(id, groupId, user_id, instrument, now, now).run();

    // If it existed, bump updated_at
    await c.env.DB.prepare(
      'UPDATE group_member_instruments SET updated_at = ? WHERE group_id = ? AND user_id = ? AND instrument = ?'
    ).bind(now, groupId, user_id, instrument).run();

    return c.json({ success: true });
  } catch (error) {
    console.error('Error adding member instrument:', error);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// Remove a single instrument assignment for a user in a group
groupRoutes.delete('/:id/member-instruments', async (c) => {
  try {
    const groupId = c.req.param('id');
    const { user_id, instrument } = await c.req.json<{ user_id: string; instrument: string }>();

    const valid = ['VO','GT','KEY','DR','BA'] as const;
    if (!user_id || !instrument || !valid.includes(instrument as typeof valid[number])) {
      return c.json({ success: false, error: 'Invalid parameters' }, 400);
    }

    await c.env.DB.prepare(
      'DELETE FROM group_member_instruments WHERE group_id = ? AND user_id = ? AND instrument = ?'
    ).bind(groupId, user_id, instrument).run();

    return c.json({ success: true });
  } catch (error) {
    console.error('Error removing member instrument:', error);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// Delete group (soft delete)
groupRoutes.delete('/:id', async (c) => {
  try {
    const groupId = c.req.param('id');
    const now = new Date().toISOString();

    await c.env.DB.prepare(
      'UPDATE groups SET is_active = FALSE, updated_at = ? WHERE id = ?'
    ).bind(now, groupId).run();

    return c.json({ success: true, message: 'Group deleted successfully' });
  } catch (error) {
    console.error('Error deleting group:', error);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { groupRoutes };
