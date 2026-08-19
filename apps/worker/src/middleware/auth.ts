import type { Context } from 'hono';
import type { Bindings, Variables } from '../index';
import type { User } from '../types';
import { createD1AuthRepository } from '../features/auth/infrastructure/d1-repository';
import { resolveSession } from '../features/auth/application/session';
import { webCryptoSessionTokenProvider } from '../features/auth/infrastructure/session-token';
import { clearSessionCookies, getSessionCookie, hasLegacySessionCookie } from './session-cookie';

export const requireAuth = async (c: Context<{ Bindings: Bindings; Variables: Variables }>, next: () => Promise<void>) => {
  try {
    const token = getSessionCookie(c);
    
    if (!token) {
      if (hasLegacySessionCookie(c)) clearSessionCookies(c);
      return c.json({ success: false, error: 'NO_AUTHENTICATION_TOKEN' }, 401);
    }

    const fullUser = await resolveSession(
      createD1AuthRepository(c.env.DB),
      webCryptoSessionTokenProvider,
      token,
      new Date(),
    );

    if (!fullUser) {
      clearSessionCookies(c);
      return c.json({ success: false, error: 'INVALID_SESSION' }, 401);
    }

    const avatarUrl = fullUser.avatar || undefined;
    const userData: User = {
      id: fullUser.id,
      name: fullUser.name,
      nickname: fullUser.nickname ?? null,
      email: fullUser.email,
      picture: avatarUrl,
      instruments: safeJsonParse(fullUser.instruments, []) as User['instruments'],
      grade: Number(fullUser.grade),
      role: fullUser.role as User['role'],
      created_at: fullUser.created_at,
      updated_at: fullUser.updated_at || '',
    };

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
