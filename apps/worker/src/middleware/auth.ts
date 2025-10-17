import type { Context } from 'hono';
import type { Bindings, Variables } from '../index';
import { User } from '../types';

export const requireAuth = async (c: Context<{ Bindings: Bindings; Variables: Variables }>, next: any) => {
  const authHeader = c.req.header('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({
      success: false,
      error: 'Authorization header missing or invalid'
    }, 401);
  }

  const token = authHeader.substring(7);
  
  try {
    // JWTトークンを検証（簡易版 - 本番では適切な検証が必要）
    const payload = JSON.parse(atob(token.split('.')[1]));
    
    if (!payload.email) {
      return c.json({
        success: false,
        error: 'Invalid token'
      }, 401);
    }

    // データベースからユーザー情報を取得
    const user = await c.env.DB.prepare(
      'SELECT * FROM users WHERE email = ?'
    ).bind(payload.email).first() as User;

    if (!user) {
      return c.json({
        success: false,
        error: 'User not found'
      }, 401);
    }

    // ユーザー情報をContextにセット
    c.set('user', user);
    
    return await next();
  } catch (error) {
    return c.json({
      success: false,
      error: 'Token verification failed'
    }, 401);
  }
};
