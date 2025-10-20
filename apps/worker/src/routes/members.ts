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
      SELECT u.*, gm.group_id, gm.role as member_role, g.name as group_name
      FROM users u
      JOIN group_members gm ON u.id = gm.user_id
      JOIN groups g ON gm.group_id = g.id
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
        GROUP_CONCAT(g.name) as groups,
        GROUP_CONCAT(gm.role) as group_roles
      FROM users u
      LEFT JOIN group_members gm ON u.id = gm.user_id
      LEFT JOIN groups g ON gm.group_id = g.id AND g.is_active = TRUE
      GROUP BY u.id
      ORDER BY u.name ASC
    `).all();

    // Process the results to format groups and roles
    const processedMembers = members.results.map((member: unknown) => ({
      ...member,
      groups: member.groups ? member.groups.split(',') : [],
      group_roles: member.group_roles ? member.group_roles.split(',') : [],
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
      SELECT u.*, gm.role as member_role, gm.joined_at
      FROM users u
      JOIN group_members gm ON u.id = gm.user_id
      WHERE gm.group_id = ?
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
    const { user_id, role = 'member' } = await c.req.json();

    const now = new Date().toISOString();

    await c.env.DB.prepare(`
      INSERT INTO group_members (id, group_id, user_id, role, joined_at)
      VALUES (?, ?, ?, ?, ?)
    `).bind(crypto.randomUUID(), groupId, user_id, role, now).run();

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
      'DELETE FROM group_members WHERE group_id = ? AND user_id = ?'
    ).bind(groupId, userId).run();

    return c.json({ success: true, message: 'Member removed from group successfully' });
  } catch (error) {
    console.error('Error removing member from group:', error);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { memberRoutes };