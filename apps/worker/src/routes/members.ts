import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth';
import { Bindings } from '../index';

const memberRoutes = new Hono<{ Bindings: Bindings }>();

// Apply authentication middleware to all routes
memberRoutes.use('*', requireAuth);

// fetch_members - Get all members
memberRoutes.get('/fetch', async (c) => {
  try {
    const members = await c.env.DB.prepare(`
      SELECT u.*, gmi.group_id, g.name as group_name
      FROM users u
      JOIN group_member_instruments gmi ON u.id = gmi.user_id
      JOIN groups g ON gmi.group_id = g.id
      WHERE g.is_active = TRUE
      ORDER BY u.name ASC
    `).all();

    return c.json({ success: true, data: members.results });
  } catch (error) {
    console.error('Error fetching members:', error);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// fetch_member_list - Get member list with group information
memberRoutes.get('/list', async (c) => {
  try {
    const members = await c.env.DB.prepare(`
      SELECT 
        u.id,
        u.name,
        u.nickname,
        u.email,
        u.student_number,
        u.grade,
        u.instruments,
        u.role,
        u.image,
        GROUP_CONCAT(DISTINCT g.name) as groups
      FROM users u
      LEFT JOIN group_member_instruments gmi ON u.id = gmi.user_id
      LEFT JOIN groups g ON gmi.group_id = g.id AND g.is_active = TRUE
      GROUP BY u.id
      ORDER BY u.name ASC
    `).all();

    // Process the results to format groups and roles
    const processedMembers = members.results.map((member: unknown) => ({
      ...member,
      groups: member.groups ? member.groups.split(',') : [],
      instruments: JSON.parse(member.instruments || '[]')
    }));

    return c.json({ success: true, data: processedMembers });
  } catch (error) {
    console.error('Error fetching member list:', error);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// fetch_nickname - Get user nickname by ID
memberRoutes.get('/nickname/:id', async (c) => {
  try {
    const userId = c.req.param('id');

    const user = await c.env.DB.prepare(
      'SELECT nickname FROM users WHERE id = ?'
    ).bind(userId).first();

    if (!user) {
      return c.json({ success: false, error: 'User not found' }, 404);
    }

    return c.json({ success: true, data: { nickname: user.nickname } });
  } catch (error) {
    console.error('Error fetching nickname:', error);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// Get members by group
memberRoutes.get('/group/:groupId', async (c) => {
  try {
    const groupId = c.req.param('groupId');

    const members = await c.env.DB.prepare(`
      SELECT u.*, MIN(gmi.created_at) as joined_at
      FROM users u
      JOIN group_member_instruments gmi ON u.id = gmi.user_id
      WHERE gmi.group_id = ?
      GROUP BY u.id
      ORDER BY u.name ASC
    `).bind(groupId).all();

    // Parse instruments JSON
    const processedMembers = members.results.map((member: unknown) => ({
      ...member,
      instruments: JSON.parse(member.instruments || '[]')
    }));

    return c.json({ success: true, data: processedMembers });
  } catch (error) {
    console.error('Error fetching group members:', error);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// Add member to group
memberRoutes.post('/group/:groupId', async (c) => {
  try {
    const groupId = c.req.param('groupId');
    const { user_id, instrument } = await c.req.json();

    const now = new Date().toISOString();

    if (!user_id || !instrument || !['VO','GT','KEY','DR','BA'].includes(instrument)) {
      return c.json({ success: false, error: 'Invalid parameters' }, 400);
    }

    await c.env.DB.prepare(`
      INSERT OR IGNORE INTO group_member_instruments (id, group_id, user_id, instrument, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(crypto.randomUUID(), groupId, user_id, instrument, now, now).run();

    await c.env.DB.prepare(
      'UPDATE group_member_instruments SET updated_at = ? WHERE group_id = ? AND user_id = ? AND instrument = ?'
    ).bind(now, groupId, user_id, instrument).run();

    return c.json({ success: true, message: 'Member added to group successfully' });
  } catch (error) {
    console.error('Error adding member to group:', error);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// Remove member from group
memberRoutes.delete('/group/:groupId/:userId', async (c) => {
  try {
    const groupId = c.req.param('groupId');
    const userId = c.req.param('userId');

    await c.env.DB.prepare(
      'DELETE FROM group_member_instruments WHERE group_id = ? AND user_id = ?'
    ).bind(groupId, userId).run();

    return c.json({ success: true, message: 'Member removed from group successfully' });
  } catch (error) {
    console.error('Error removing member from group:', error);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { memberRoutes };