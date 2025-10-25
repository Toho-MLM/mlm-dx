import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth';
import type { Bindings, Variables } from '../index';
import { UserWithInstrumentsSchema, UpdateUserRequestSchema } from '../schemas';

const userRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Apply authentication middleware to all routes
userRoutes.use('*', requireAuth);

// get_me - Get current user data
userRoutes.get('/me', async (c) => {
  try {
    const user = c.get('user');
    
    const userWithStudentNumber = UserWithInstrumentsSchema.parse({
      ...user,
      student_number: (user.email as string).substring(0, 6).toUpperCase()
    });

    return c.json({ success: true, data: userWithStudentNumber });
  } catch (error) {
    console.error('Error fetching current user:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

// update_user - Update user data
userRoutes.put('/me', async (c) => {
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

    return c.json({ success: true, message: 'User updated successfully' });
  } catch (error) {
    console.error('Error updating user:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

export { userRoutes };
