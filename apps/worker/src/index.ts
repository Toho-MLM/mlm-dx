import { Hono } from 'hono';
import type { D1Database } from '@cloudflare/workers-types';
import type { Context } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { authHandler } from '@hono/auth-js';
import { getAuthConfig } from './auth';
import { userRoutes } from './routes/users';
import { groupRoutes } from './routes/groups';
import { memberRoutes } from './routes/members';
import { reservationRoutes } from './routes/reservations';
import { archiveRoutes } from './routes/archive';
import { authRoutes } from './routes/auth';
import type { User } from './types';

export type Bindings = {
  DB: D1Database;
  AUTH_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  CORS_ORIGIN: string;
  FRONTEND_URL: string;
  YOUTUBE_REFRESH_TOKEN: string;
};

export type Variables = {
  user: User;
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.use('*', logger());
app.use('*', cors({
  origin: (origin: string, c: Context) => {
    const allowedOrigins = c.env.CORS_ORIGIN.split(',');
    return allowedOrigins.includes(origin) ? origin : '';
  },
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
}));

app.use('/auth/*', async (c, next) => {
  const authConfig = getAuthConfig(c);
  if (!authConfig.secret) {
    console.error('AUTH_SECRET not configured');
    return c.json({ error: 'Auth configuration error' }, 500);
  }
  
  // 呼び出しシグネチャの型差異を吸収
  return (authHandler as any)(authConfig)(c, next);
});

app.route('/auth', authRoutes);
app.route('/users', userRoutes);
app.route('/groups', groupRoutes);
app.route('/members', memberRoutes);
app.route('/reservations', reservationRoutes);
app.route('/archive', archiveRoutes);

app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default app;
