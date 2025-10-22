import { Hono } from 'hono';
import type { D1Database } from '@cloudflare/workers-types';
import type { Context } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { generateState, createGoogleAuthUrl, exchangeCodeForToken, getGoogleUserInfo, generateJWT, verifyJWT } from './auth';
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
  FRONTEND_URL: string;
  YOUTUBE_REFRESH_TOKEN: string;
  NODE_ENV: string;
  AUTH_URL: string;
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

app.post('/api/auth/signin/google', async (c) => {
  try {
    const state = generateState();
    const redirectUri = `${c.env.AUTH_URL}/auth/callback/google`;

    setCookie(c, 'oauth_state', state, {
      httpOnly: true,
      secure: c.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600, 
      path: '/',
    });

    const authUrl = createGoogleAuthUrl(
      c.env.GOOGLE_CLIENT_ID,
      redirectUri,
      state
    );

    return c.json({ authUrl });
  } catch (error) {
    console.error('Auth signin error:', error);
    return c.json({ error: 'Authentication failed' }, 500);
  }
});

// Google OAuth認証コールバック
app.get('/auth/callback/google', async (c) => {
  try {
    const code = c.req.query('code');
    const state = c.req.query('state');
    const storedState = getCookie(c, 'oauth_state');

    if (!code || !state || !storedState || state !== storedState) {
      return c.json({ error: 'Invalid state parameter' }, 400);
    }

    // state Cookieを削除
    deleteCookie(c, 'oauth_state');

    // 認可コードをトークンに交換
    const redirectUri = `${c.env.AUTH_URL}/auth/callback/google`;
    const tokenData = await exchangeCodeForToken(
      code,
      c.env.GOOGLE_CLIENT_ID,
      c.env.GOOGLE_CLIENT_SECRET,
      redirectUri
    );

    if (!tokenData) {
      return c.json({ error: 'Token exchange failed' }, 400);
    }

    // Googleユーザー情報を取得
    const googleUser = await getGoogleUserInfo(tokenData.accessToken);
    if (!googleUser) {
      return c.json({ error: 'Failed to get user info' }, 400);
    }

    // ホワイトリスト判定
    const dbUser = await c.env.DB.prepare(
      'SELECT * FROM users WHERE email = ?'
    ).bind(googleUser.email).first() as any;

    if (!dbUser) {
      return c.json({ error: 'Access denied - user not in whitelist' }, 403);
    }

    // ユーザー情報を更新（名前が変更された場合）
    if (dbUser.name !== googleUser.name) {
      const now = new Date().toISOString();
      await c.env.DB.prepare(
        'UPDATE users SET name = ?, updated_at = ? WHERE email = ?'
      ).bind(
        googleUser.name || googleUser.email,
        now,
        googleUser.email
      ).run();
    }

    // JWTを生成
    const jwt = await generateJWT({
      id: dbUser.id,
      email: googleUser.email,
      name: googleUser.name,
      image: googleUser.image,
    }, c.env.AUTH_SECRET);

    // HttpOnly + Secure CookieにJWTを設定
    setCookie(c, 'auth_token', jwt, {
      httpOnly: true,
      secure: c.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
      path: '/',
    });

    // フロントエンドにリダイレクト
    return c.redirect(`${c.env.FRONTEND_URL}/auth/callback`);
  } catch (error) {
    console.error('Auth callback error:', error);
    return c.json({ error: 'Authentication callback failed' }, 500);
  }
});

// セッション情報取得
app.get('/api/auth/session', async (c) => {
  try {
    const token = getCookie(c, 'auth_token');
    
    if (!token) {
      return c.json({ user: null });
    }

    const payload = await verifyJWT(token, c.env.AUTH_SECRET);
    if (!payload) {
      return c.json({ user: null });
    }

    // データベースからユーザー情報を取得
    const dbUser = await c.env.DB.prepare(
      'SELECT * FROM users WHERE id = ?'
    ).bind(payload.sub).first() as any;

    if (!dbUser) {
      return c.json({ user: null });
    }

    return c.json({
      user: {
        id: dbUser.id,
        email: dbUser.email,
        name: dbUser.name,
        image: payload.picture,
      }
    });
  } catch (error) {
    console.error('Session check error:', error);
    return c.json({ user: null });
  }
});

// ログアウト
app.post('/api/auth/signout', async (c) => {
  // Cookieを削除
  deleteCookie(c, 'auth_token');

  return c.json({ success: true });
});

app.route('/users', userRoutes);
app.route('/groups', groupRoutes);
app.route('/members', memberRoutes);
app.route('/reservations', reservationRoutes);
app.route('/archive', archiveRoutes);

app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default app;