import type { Context } from 'hono';
import type { Bindings, Variables } from '../index';
import type { User } from '../types';

export const requireAuth = async (c: Context<{ Bindings: Bindings; Variables: Variables }>, next: () => Promise<Response>) => {
  const sessionToken = c.req.header('cookie')?.split(';')
    .find(c => c.trim().startsWith('next-auth.session-token='))
    ?.split('=')[1];
  
  if (!sessionToken) {
    return c.json({
      success: false,
      error: 'Session token missing'
    }, 401);
  }
  
  try {
    const result = await c.env.DB.prepare(
      'SELECT s.*, u.* FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.session_token = ? AND s.expires > datetime("now")'
    ).bind(sessionToken).first() as any;

    if (!result) {
      return c.json({
        success: false,
        error: 'Invalid or expired session'
      }, 401);
    }

    const user: User = {
      id: result.id as string,
      student_number: result.student_number as string,
      name: result.name as string,
      nickname: result.nickname as string | undefined,
      email: result.email as string,
      instruments: JSON.parse(result.instruments || '[]') as string[],
      grade: result.grade as string,
      role: result.role as 'ADMIN' | 'MBR',
      image: result.image as string | undefined,
      created_at: result.created_at as string,
      updated_at: result.updated_at as string,
    };

    c.set('user', user);
    
    return await next();
  } catch (error) {
    console.error('Session verification error:', error);
    return c.json({
      success: false,
      error: 'Session verification failed'
    }, 401);
  }
};
