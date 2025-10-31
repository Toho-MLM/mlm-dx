import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth';
import type { Bindings, Variables } from '../index';
import { UserWithInstrumentsSchema, UpdateUserRequestSchema, GroupSchema } from '../schemas';
import { z } from 'zod';

const userRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Apply authentication middleware to all routes
userRoutes.use('*', requireAuth);

// get_me - Get current user data
userRoutes.get('/', async (c) => {
  try {
    const user = c.get('user');
    
    const { picture, ...userWithoutPicture } = user;
    
    const userDataToValidate = {
      ...userWithoutPicture,
      student_number: (user.email as string).substring(0, 6).toUpperCase()
    };
    
    const userWithStudentNumber = UserWithInstrumentsSchema.parse(userDataToValidate);

    return c.json({ success: true, data: userWithStudentNumber });
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('Zod validation errors:');
      error.issues.forEach((issue) => {
        if ('expected' in issue && 'received' in issue) {
          console.error(`  Path: ${JSON.stringify(issue.path)}, Expected: ${(issue as any).expected}, Received: ${(issue as any).received}`);
        } else {
          console.error(`  Path: ${JSON.stringify(issue.path)}, Issue: ${issue.code}`);
        }
      });
    }
    console.error('Error fetching current user:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

// GET /me/groups/select - ログインユーザーの有効グループの軽量リスト
userRoutes.get('/groups/select', async (c) => {
  try {
    const user = c.get('user');
    const userId = user.id;

    const groups = await c.env.DB.prepare(`
      SELECT DISTINCT g.id, g.name, g.is_main
      FROM groups g
      JOIN group_member_instruments gmi ON g.id = gmi.group_id
      WHERE gmi.user_id = ? AND g.is_active = TRUE
      ORDER BY g.is_main DESC, g.created_at DESC
    `).bind(userId).all();

    return c.json({ success: true, data: groups.results });
  } catch (error) {
    console.error('Error fetching my group select:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

// update_user - Update user data
userRoutes.put('/', async (c) => {
  try {
    const user = c.get('user');
    const requestData = UpdateUserRequestSchema.parse(await c.req.json());

    const now = new Date().toISOString();
    const instrumentsJson = JSON.stringify(requestData.instruments);

    await c.env.DB.prepare(
      'UPDATE users SET nickname = ?, instruments = ?, updated_at = ? WHERE email = ?'
    ).bind(requestData.nickname, instrumentsJson, now, user.email).run();

    // ニックネームが更新された場合はJWTを再発行
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

export { userRoutes };

