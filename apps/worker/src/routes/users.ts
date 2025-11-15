import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth';
import type { Bindings, Variables } from '../index';
import { UserWithInstrumentsSchema, UpdateUserRequestSchema } from '../schemas';
import { requireAdmin } from '../utils/admin';
import { z } from 'zod';

const userRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

userRoutes.use('*', requireAuth);

userRoutes.get('/', async (c) => {
  try {
    const user = c.get('user');
    
    const { picture, ...userWithoutPicture } = user;
    void picture;
    
    const userDataToValidate = {
      ...userWithoutPicture,
      student_number: user.email.substring(0, 6).toUpperCase()
    };
    
    const userWithStudentNumber = UserWithInstrumentsSchema.parse(userDataToValidate);

    return c.json({ success: true, data: userWithStudentNumber });
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('Zod validation errors:');
      error.issues.forEach((issue) => {
        if ('expected' in issue && 'received' in issue) {
          const typedIssue = issue as z.ZodIssue & { expected?: string; received?: string };
          console.error(`  Path: ${JSON.stringify(issue.path)}, Expected: ${typedIssue.expected}, Received: ${typedIssue.received}`);
        } else {
          console.error(`  Path: ${JSON.stringify(issue.path)}, Issue: ${issue.code}`);
        }
      });
    }
    console.error('Error fetching current user:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

userRoutes.get('/groups/select', async (c) => {
  try {
    const user = c.get('user');
    const userId = user.id;

    const adminParam = c.req.query('admin');
    const isAdminMode = adminParam === 'true';

    if (isAdminMode) {
      try {
        requireAdmin(user.role);
      } catch (error) {
        return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403);
      }
    }

    let query: string;
    let params: string[];

    if (isAdminMode) {
      query = `
        SELECT DISTINCT g.id, g.name, g.is_main
        FROM groups g
        WHERE g.is_active = TRUE
        ORDER BY g.is_main DESC, g.created_at DESC
      `;
      params = [];
    } else {
      query = `
        SELECT DISTINCT g.id, g.name, g.is_main
        FROM groups g
        JOIN group_member_instruments gmi ON g.id = gmi.group_id
        WHERE gmi.user_id = ? AND g.is_active = TRUE
        ORDER BY g.is_main DESC, g.created_at DESC
      `;
      params = [userId];
    }

    const groups = await c.env.DB.prepare(query).bind(...params).all();

    return c.json({ success: true, data: groups.results });
  } catch (error) {
    console.error('Error fetching my group select:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

userRoutes.put('/', async (c) => {
  try {
    const user = c.get('user');
    const requestData = UpdateUserRequestSchema.parse(await c.req.json());

    const now = new Date().toISOString();
    const instrumentsJson = JSON.stringify(requestData.instruments);

    await c.env.DB.prepare(
      'UPDATE users SET nickname = ?, instruments = ?, updated_at = ? WHERE email = ?'
    ).bind(requestData.nickname, instrumentsJson, now, user.email).run();

    if (requestData.nickname !== user.nickname) {
      const { generateJWT } = await import('../auth');
      const { setCookie } = await import('hono/cookie');
      
      const jwt = await generateJWT({
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.picture,
      }, requestData.nickname, c.env.AUTH_SECRET);

      setCookie(c, 'auth_token', jwt, {
        httpOnly: true,
        secure: c.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60,
        path: '/',
      });
    }

    return c.json({ success: true });
  } catch (error) {
    console.error('Error updating user:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

userRoutes.post('/avatar/reset', async (c) => {
  try {
    const user = c.get('user');
    const now = new Date().toISOString();

    await c.env.DB.prepare(
      'UPDATE users SET avatar = NULL, updated_at = ? WHERE id = ?'
    ).bind(now, user.id).run();

    return c.json({ success: true });
  } catch (error) {
    console.error('Error resetting avatar:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

export { userRoutes };

