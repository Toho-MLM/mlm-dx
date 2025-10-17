import { Hono } from 'hono';
import type { D1Database } from '@cloudflare/workers-types';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { authHandler } from '@hono/auth-js';
import { getAuthConfig } from './auth';
import { userRoutes } from './routes/users';
import { groupRoutes } from './routes/groups';
import { memberRoutes } from './routes/members';
import { reservationRoutes } from './routes/reservations';
import { archiveRoutes } from './routes/archive';
import type { User } from './types';

export type Bindings = {
  DB: D1Database;
  AUTH_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  CORS_ORIGIN: string;
};

export type Variables = {
  user: User;
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.use('*', logger());
app.use('*', cors({
  origin: (c: any) => {
    const origin = c.req.header('Origin');
    const allowedOrigins = c.env.CORS_ORIGIN.split(',');
    return allowedOrigins.includes(origin || '') ? origin : '';
  },
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
}));

app.use('/api/auth/*', async (c, next) => {
  const authConfig = getAuthConfig(c);
  return authHandler()(c, next);
});

app.route('/api/users', userRoutes);
app.route('/api/groups', groupRoutes);
app.route('/api/members', memberRoutes);
app.route('/api/reservations', reservationRoutes);
app.route('/api/archive', archiveRoutes);

app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default app;
