import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth';
import type { Bindings, Variables } from '../index';

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

export { memberRoutes };