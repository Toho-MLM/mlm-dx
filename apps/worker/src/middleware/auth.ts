import type { Context } from 'hono';
import type { Bindings, Variables } from '../index';
import type { User } from '../types';
import { getCookie } from 'hono/cookie';
import { getAuthConfig } from '../auth';
import { decode } from '@auth/core/jwt';

export const requireAuth = async (c: Context<{ Bindings: Bindings; Variables: Variables }>, next: () => Promise<void>) => {
  try {
    const authConfig = getAuthConfig(c);

    // Honoの公式Cookieミドルウェアを使用してJWTトークンを取得
    const sessionToken = getCookie(c, 'next-auth.session-token');

    if (!sessionToken) {
      return c.json({ success: false, error: 'No session token' }, 401);
    }

    // Auth.jsのJWT decodeで署名検証を実施（session-token用のsaltを指定）
    const payload = await decode({ token: sessionToken, secret: authConfig.secret, salt: 'session-token' });

    if (!payload || !payload.sub || (payload.exp && payload.exp < Date.now() / 1000)) {
      return c.json({ success: false, error: 'Invalid session token' }, 401);
    }

    // DBでユーザー確認（JWTのsubとusersテーブルのIDを整合）
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
    console.error('Session verification error:', error);
    return c.json({ success: false, error: 'Session verification failed' }, 401);
  }
};

// 以降の自前JWT処理は不要

// 安全なJSON解析関数
function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}