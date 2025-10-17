import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth';
import { Bindings } from '../index';

const groupRoutes = new Hono<{ Bindings: Bindings }>();

// Apply authentication middleware to all routes
groupRoutes.use('*', requireAuth);

// upsert_group - Create or update a group
groupRoutes.post('/upsert', async (c) => {
  try {
    const user = c.get('user');
    const { id, name, assignments, is_main = false } = await c.req.json();

    const now = new Date().toISOString();
    const assignmentsJson = JSON.stringify(assignments || {});

    if (id) {
      // Update existing group
      await c.env.DB.prepare(`
        UPDATE groups 
        SET name = ?, assignments = ?, is_main = ?, updated_at = ?
        WHERE id = ?
      `).bind(name, assignmentsJson, is_main, now, id).run();
    } else {
      // Create new group
      const newId = crypto.randomUUID();
      await c.env.DB.prepare(`
        INSERT INTO groups (id, name, assignments, is_main, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, TRUE, ?, ?)
      `).bind(newId, name, assignmentsJson, is_main, now, now).run();
      
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
      SELECT g.*, COUNT(gm.user_id) as member_count
      FROM groups g
      LEFT JOIN group_members gm ON g.id = gm.group_id
      WHERE g.is_active = TRUE
      GROUP BY g.id
      ORDER BY g.name ASC
    `).all();

    // Parse assignments JSON
    const processedGroups = groups.results.map((group: any) => ({
      ...group,
      assignments: JSON.parse(group.assignments || '{}')
    }));

    return c.json({ success: true, data: processedGroups });
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

    // Parse assignments JSON
    const processedGroup = {
      ...group,
      assignments: JSON.parse(group.assignments || '{}')
    };

    return c.json({ success: true, data: processedGroup });
  } catch (error) {
    console.error('Error fetching group:', error);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// Update group
groupRoutes.put('/:id', async (c) => {
  try {
    const groupId = c.req.param('id');
    const { name, assignments, is_main, is_active } = await c.req.json();

    const now = new Date().toISOString();
    const assignmentsJson = JSON.stringify(assignments || {});

    await c.env.DB.prepare(`
      UPDATE groups 
      SET name = ?, assignments = ?, is_main = ?, is_active = ?, updated_at = ?
      WHERE id = ?
    `).bind(name, assignmentsJson, is_main, is_active, now, groupId).run();

    return c.json({ success: true, message: 'Group updated successfully' });
  } catch (error) {
    console.error('Error updating group:', error);
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
