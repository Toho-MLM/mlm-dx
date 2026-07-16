import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth';
import { requireAdmin } from '../utils/admin';
import type { Bindings, Variables } from '../index';
import { z } from 'zod';

function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}

const memberRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

type MemberListRow = {
  id: string;
  name: string;
  nickname: string | null;
  email: string;
  grade: number;
  instruments: string;
  role: string;
  groups: string | null;
  student_number: string;
};

type MemberSelectRow = Pick<
  MemberListRow,
  'id' | 'name' | 'nickname' | 'grade' | 'instruments' | 'student_number'
>;

memberRoutes.use('*', requireAuth);

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
      ORDER BY u.grade DESC, UPPER(SUBSTR(u.email, 1, 6)) ASC
    `).all<MemberListRow>();

    const processedMembers = members.results.map((member) => ({
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

memberRoutes.post('/', async (c) => {
  try {
    const user = c.get('user');
    requireAdmin(user.role);

    const requestData = z.object({
      name: z.string().min(1),
      email: z.string().email(),
      grade: z.number().min(1).max(6),
    }).parse(await c.req.json());

    const normalizedEmail = requestData.email.trim().toLowerCase();

    const existing = await c.env.DB.prepare(
      'SELECT id FROM users WHERE lower(email) = lower(?)'
    ).bind(normalizedEmail).first();
    if (existing) {
      return c.json({ success: false, error: 'EMAIL_ALREADY_EXISTS' }, 409);
    }

    const now = new Date().toISOString();
    const newId = crypto.randomUUID();
    
    await c.env.DB.prepare(`
      INSERT INTO users (id, name, nickname, email, grade, instruments, role, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      newId,
      requestData.name,
      null,
      normalizedEmail,
      requestData.grade,
      JSON.stringify([]),
      'MBR',
      now,
      now
    ).run();
    
    return c.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ success: false, error: 'INVALID_REQUEST_DATA' }, 400);
    }
    
    if (error && typeof error === 'object' && 'message' in error) {
      const errorMessage = String(error.message);
      if (errorMessage.includes('UNIQUE constraint failed') || errorMessage.includes('email')) {
        return c.json({ success: false, error: 'EMAIL_ALREADY_EXISTS' }, 409);
      }
    }
    
    console.error('Error creating member:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

memberRoutes.put('/:id', async (c) => {
  try {
    const user = c.get('user');
    requireAdmin(user.role);

    const memberId = c.req.param('id');
    const requestData = z.object({
      nickname: z.string().min(1),
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

    return c.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ success: false, error: 'INVALID_REQUEST_DATA' }, 400);
    }
    
    if (error && typeof error === 'object' && 'message' in error) {
      const errorMessage = String(error.message);
      if (errorMessage.includes('UNIQUE constraint failed') || errorMessage.includes('email')) {
        return c.json({ success: false, error: 'EMAIL_ALREADY_EXISTS' }, 409);
      }
    }
    
    console.error('Error updating member:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

memberRoutes.post('/bulk', async (c) => {
  try {
    const user = c.get('user');
    requireAdmin(user.role);

    const requestData = z.object({
      members: z.array(z.object({
        name: z.string().min(1),
        email: z.string().email(),
        grade: z.number().min(1).max(6),
        nickname: z.string().optional(),
        instruments: z.array(z.string()).optional(),
        role: z.enum(['MGR', 'CHF', 'MAC', 'MBR', 'ADM', 'NHD', 'NAC']).optional(),
      })),
    }).parse(await c.req.json());

    const now = new Date().toISOString();
    const results = {
      created: [] as string[],
      failed: [] as Array<{ email: string; error: string }>,
    };

    const normalizedMembers = requestData.members.map(m => ({
      name: m.name,
      email: m.email.trim().toLowerCase(),
      grade: m.grade,
      nickname: m.nickname ?? null,
      instruments: Array.isArray(m.instruments) ? m.instruments : [],
      role: m.role,
    }));

    const seen = new Set<string>();
    const inputDuplicates = new Set<string>();
    for (const m of normalizedMembers) {
      if (seen.has(m.email)) {
        inputDuplicates.add(m.email);
      } else {
        seen.add(m.email);
      }
    }

    for (const dup of inputDuplicates) {
      results.failed.push({ email: dup, error: 'DUPLICATE_IN_INPUT' });
    }

    const uniqueEmails = [...seen];
    if (uniqueEmails.length > 0) {
      const placeholders = uniqueEmails.map(() => '?').join(',');
      const existingRows = await c.env.DB.prepare(
        `SELECT email FROM users WHERE lower(email) IN (${placeholders})`
      ).bind(...uniqueEmails).all();
      const existingEmails = new Set(
        (existingRows.results as Array<{ email: string }>).map(r => String(r.email).toLowerCase())
      );

      for (const m of normalizedMembers) {
        if (inputDuplicates.has(m.email)) {
          continue;
        }
        if (existingEmails.has(m.email)) {
          results.failed.push({ email: m.email, error: 'EMAIL_ALREADY_EXISTS' });
          continue;
        }
        try {
          const newId = crypto.randomUUID();
          await c.env.DB.prepare(
            `INSERT INTO users (id, name, nickname, email, grade, instruments, role, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            newId,
            m.name,
            m.nickname,
            m.email,
            m.grade,
            JSON.stringify(m.instruments || []),
            m.role ?? 'MBR',
            now,
            now
          ).run();
          results.created.push(m.email);
        } catch (error) {
          results.failed.push({ email: m.email, error: 'INTERNAL_ERROR' });
        }
      }
    }

    return c.json({ 
      success: true, 
      data: {
        created: results.created,
        failed: results.failed,
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ success: false, error: 'INVALID_REQUEST_DATA' }, 400);
    }
    
    console.error('Error creating members in bulk:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

memberRoutes.post('/move-up-grade', async (c) => {
  try {
    const user = c.get('user');
    requireAdmin(user.role);

    const deleteTargetCountRow = await c.env.DB.prepare(
      `
      SELECT COUNT(*) as count
      FROM users
      WHERE
        (LOWER(SUBSTR(email, 1, 1)) = 'n' AND grade = 4)
        OR (LOWER(SUBSTR(email, 1, 1)) = 'm' AND grade = 6)
      `
    ).first<{ count: number | string }>();
    const moveUpGradeTargetCountRow = await c.env.DB.prepare(
      `
      SELECT COUNT(*) as count
      FROM users
      WHERE grade BETWEEN 1 AND 5
        AND NOT (LOWER(SUBSTR(email, 1, 1)) = 'n' AND grade = 4)
      `
    ).first<{ count: number | string }>();

    const deletedCount = Number(deleteTargetCountRow?.count ?? 0);
    const movedUpCount = Number(moveUpGradeTargetCountRow?.count ?? 0);
    const now = new Date().toISOString();

    await c.env.DB.batch([
      c.env.DB.prepare(`
        DELETE FROM users
        WHERE
          (LOWER(SUBSTR(email, 1, 1)) = 'n' AND grade = 4)
          OR (LOWER(SUBSTR(email, 1, 1)) = 'm' AND grade = 6)
      `),
      c.env.DB.prepare(`
        UPDATE users
        SET grade = grade + 1, updated_at = ?
        WHERE grade BETWEEN 1 AND 5
          AND NOT (LOWER(SUBSTR(email, 1, 1)) = 'n' AND grade = 4)
      `).bind(now),
    ]);

    return c.json({
      success: true,
      data: {
        deletedCount,
        movedUpCount,
      },
    });
  } catch (error) {
    console.error('Error moving up grades:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

memberRoutes.delete('/:id', async (c) => {
  try {
    const user = c.get('user');
    requireAdmin(user.role);

    const memberId = c.req.param('id');

    const existingMember = await c.env.DB.prepare(
      'SELECT id FROM users WHERE id = ?'
    ).bind(memberId).first();

    if (!existingMember) {
      return c.json({ success: false, error: 'MEMBER_NOT_FOUND' }, 404);
    }

    await c.env.DB.prepare(
      'DELETE FROM users WHERE id = ?'
    ).bind(memberId).run();

    return c.json({ success: true, message: 'Member deleted successfully' });
  } catch (error) {
    console.error('Error deleting member:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

memberRoutes.get('/select', async (c) => {
  try {
    const user = c.get('user');
    const currentUserId = user.id;

    const members = await c.env.DB.prepare(`
      SELECT 
        u.id,
        u.name,
        u.nickname,
        u.instruments,
        u.grade,
        UPPER(SUBSTR(u.email, 1, 6)) as student_number
      FROM users u
      WHERE u.name IS NOT NULL
      ORDER BY 
        CASE WHEN u.id = ? THEN 0 ELSE 1 END,
        u.grade DESC,
        UPPER(SUBSTR(u.email, 1, 6)) ASC
    `).bind(currentUserId).all<MemberSelectRow>();

    const processedMembers = members.results.map((member) => {
      const displayName = `${member.student_number} ${member.nickname || member.name}`;
      const realName = `${member.student_number} ${member.name}`;
      const instruments = safeJsonParse<string[]>(member.instruments || '[]', []);
      return {
        id: member.id,
        name: displayName,
        display_name: displayName,
        real_name: realName,
        instruments,
      };
    });

    return c.json({ success: true, data: processedMembers });
  } catch (error) {
    console.error('Error fetching member select:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

export { memberRoutes };
