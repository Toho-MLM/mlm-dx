import type { Context } from 'hono';
import type { Bindings, Variables, UserRow } from '../index';
import type { User } from '../types';
import { getCookie } from 'hono/cookie';
import { verifyJWT } from '../auth';

export const requireAuth = async (c: Context<{ Bindings: Bindings; Variables: Variables }>, next: () => Promise<void>) => {
  try {
    const token = getCookie(c, 'auth_token');
    
    if (!token) {
      return c.json({ success: false, error: 'NO_AUTHENTICATION_TOKEN' }, 401);
    }

    const payload = await verifyJWT(token, c.env.AUTH_SECRET);
    if (!payload) {
      return c.json({ success: false, error: 'INVALID_TOKEN' }, 401);
    }

    const fullUser = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?')
      .bind(payload.sub).first<UserRow>();

    if (!fullUser) {
      return c.json({ success: false, error: 'USER_NOT_FOUND' }, 401);
    }

    const avatarUrl = fullUser.avatar || payload.picture || undefined;
    const userData: User = {
      id: fullUser.id,
      name: fullUser.name,
      nickname: payload.nickname,
      email: fullUser.email,
      picture: avatarUrl,
      instruments: safeJsonParse(fullUser.instruments, []),
      grade: Number(fullUser.grade),
      role: fullUser.role,
      created_at: fullUser.created_at,
      updated_at: fullUser.updated_at || '',
    };

    // Add student_number as computed field
    const userWithStudentNumber = {
      ...userData,
      student_number: fullUser.email.substring(0, 6).toUpperCase()
    };

    c.set('user', userWithStudentNumber);
    await next();
    return c.res;
  } catch (error) {
    console.error('Authentication error:', error);
    return c.json({ success: false, error: 'AUTHENTICATION_FAILED' }, 401);
  }
};

function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}
