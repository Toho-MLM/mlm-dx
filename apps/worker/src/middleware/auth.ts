import type { Context } from 'hono';
import type { Bindings, Variables } from '../index';
import type { User } from '../types';
import { getCookie } from 'hono/cookie';
import { verifyJWT } from '../auth';

export const requireAuth = async (c: Context<{ Bindings: Bindings; Variables: Variables }>, next: () => Promise<void>) => {
  try {
    const token = getCookie(c, 'auth_token');
    
    if (!token) {
      return c.json({ success: false, error: 'No authentication token' }, 401);
    }

    const payload = await verifyJWT(token, c.env.AUTH_SECRET);
    if (!payload) {
      return c.json({ success: false, error: 'Invalid token' }, 401);
    }

    const fullUser = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?')
      .bind(payload.sub).first() as any;

    if (!fullUser) {
      return c.json({ success: false, error: 'User not found' }, 401);
    }

    const userData: User = {
      id: fullUser.id,
      student_number: fullUser.student_number,
      name: fullUser.name,
      nickname: fullUser.nickname,
      email: fullUser.email,
      instruments: safeJsonParse(fullUser.instruments, []),
      grade: Number(fullUser.grade),
      role: fullUser.role,
      created_at: fullUser.created_at,
      updated_at: fullUser.updated_at,
    };

    c.set('user', userData);
    await next();
    return c.res;
  } catch (error) {
    console.error('Authentication error:', error);
    return c.json({ success: false, error: 'Authentication failed' }, 401);
  }
};

function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}