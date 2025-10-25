import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth';
import { requireAdmin } from '../utils/admin';
import type { Bindings, Variables } from '../index';
import { z } from 'zod';

// 安全なJSON解析関数
function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}

const memberRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Apply authentication middleware to all routes
memberRoutes.use('*', requireAuth);

// fetch_member_list - Get member list with group information
memberRoutes.get('/', async (c) => {
  try {
    const members = await c.env.DB.prepare(`
      SELECT 
        u.id,
        u.name,
        u.nickname,
        u.email,
        u.grade,
        u.instruments,
        u.role,
        GROUP_CONCAT(DISTINCT g.name) as groups,
        UPPER(SUBSTR(u.email, 1, 6)) as student_number
      FROM users u
      LEFT JOIN group_member_instruments gmi ON u.id = gmi.user_id
      LEFT JOIN groups g ON gmi.group_id = g.id AND g.is_active = TRUE
      GROUP BY u.id
      ORDER BY u.name ASC
    `).all();

    // Process the results to format groups and roles
    const processedMembers = members.results.map((member: any) => ({
      ...member,
      groups: member.groups ? member.groups.split(',') : [],
      instruments: safeJsonParse(member.instruments, [])
    }));

    return c.json({ success: true, data: processedMembers });
  } catch (error) {
    console.error('Error fetching member list:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

// Create member - Admin only
memberRoutes.post('/', async (c) => {
  try {
    const user = c.get('user');
    requireAdmin(user.role);

    const requestData = z.object({
      name: z.string().min(1),
      email: z.string().email(),
      grade: z.number().min(1).max(6),
    }).parse(await c.req.json());

    const now = new Date().toISOString();
    const newId = crypto.randomUUID();
    
    await c.env.DB.prepare(`
      INSERT INTO users (id, name, nickname, email, grade, instruments, role, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      newId,
      requestData.name,
      null, // nickname
      requestData.email,
      requestData.grade,
      JSON.stringify([]), // instruments
      'MBR', // role
      now,
      now
    ).run();
    
    return c.json({ 
      success: true, 
      message: 'Member created successfully',
      data: { id: newId }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ success: false, error: 'INVALID_REQUEST_DATA' }, 400);
    }
    console.error('Error creating member:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

// Update member - Admin only
memberRoutes.put('/:id', async (c) => {
  try {
    const user = c.get('user');
    requireAdmin(user.role);

    const memberId = c.req.param('id');
    const requestData = z.object({
      nickname: z.string().optional(),
      grade: z.number().min(1).max(6),
      instruments: z.array(z.string()),
      role: z.enum(['MGR', 'CHF', 'MAC', 'MBR', 'ADM', 'NHD', 'NAC']),
    }).parse(await c.req.json());

    const now = new Date().toISOString();

    await c.env.DB.prepare(`
      UPDATE users 
      SET nickname = ?, grade = ?, instruments = ?, role = ?, updated_at = ?
      WHERE id = ?
    `).bind(
      requestData.nickname || null,
      requestData.grade,
      JSON.stringify(requestData.instruments),
      requestData.role,
      now,
      memberId
    ).run();

    return c.json({ success: true, message: 'Member updated successfully' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ success: false, error: 'INVALID_REQUEST_DATA' }, 400);
    }
    console.error('Error updating member:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

// Delete member - Admin only
memberRoutes.delete('/:id', async (c) => {
  try {
    const user = c.get('user');
    requireAdmin(user.role);

    const memberId = c.req.param('id');

    // Check if member exists
    const existingMember = await c.env.DB.prepare(
      'SELECT id FROM users WHERE id = ?'
    ).bind(memberId).first();

    if (!existingMember) {
      return c.json({ success: false, error: 'MEMBER_NOT_FOUND' }, 404);
    }

    // Delete member (cascade will handle group_member_instruments)
    await c.env.DB.prepare(
      'DELETE FROM users WHERE id = ?'
    ).bind(memberId).run();

    return c.json({ success: true, message: 'Member deleted successfully' });
  } catch (error) {
    console.error('Error deleting member:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

export { memberRoutes };