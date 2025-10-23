import { Hono } from 'hono';
import type { D1Database } from '@cloudflare/workers-types';
import type { Context } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { generateState, generateNonce, generateCodeVerifier, generateCodeChallenge, createGoogleAuthUrl, exchangeCodeForToken, getGoogleUserInfo, verifyGoogleIdToken, generateJWT, verifyJWT } from './auth';
import { userRoutes } from './routes/users';
import { groupRoutes } from './routes/groups';
import { memberRoutes } from './routes/members';
import { reservationRoutes } from './routes/reservations';
import { archiveRoutes } from './routes/archive';
import type { User } from './types';
import { UserSchema } from './schemas';

export type Bindings = {
  DB: D1Database;
  AUTH_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  CORS_ORIGIN: string;
  FRONTEND_URL: string;
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

app.post('/auth/signin/google', async (c) => {
  try {
    const state = generateState();
    const redirectUri = `${c.env.AUTH_URL}/auth/callback/google`;
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const nonce = generateNonce();

    setCookie(c, 'oauth_state', state, {
      httpOnly: true,
      secure: c.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600, 
      path: '/',
    });

    setCookie(c, 'pkce_verifier', codeVerifier, {
      httpOnly: true,
      secure: c.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600,
      path: '/',
    });

    setCookie(c, 'oauth_nonce', nonce, {
      httpOnly: true,
      secure: c.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600,
      path: '/',
    });

    const authUrl = createGoogleAuthUrl(
      c.env.GOOGLE_CLIENT_ID,
      redirectUri,
      state,
      codeChallenge,
      nonce
    );

    return c.json({ authUrl });
  } catch (error) {
    console.error('Auth signin error:', error);
    return c.json({ error: 'Authentication failed' }, 500);
  }
});

app.get('/auth/callback/google', async (c) => {
  try {
    const code = c.req.query('code');
    const state = c.req.query('state');
    const storedState = getCookie(c, 'oauth_state');
    const storedVerifier = getCookie(c, 'pkce_verifier');
    const storedNonce = getCookie(c, 'oauth_nonce');

    if (!code || !state || !storedState || state !== storedState) {
      return c.redirect(`${c.env.FRONTEND_URL}/login?error=invalid_state`);
    }

    deleteCookie(c, 'oauth_state');
    deleteCookie(c, 'pkce_verifier');
    deleteCookie(c, 'oauth_nonce');

    const redirectUri = `${c.env.AUTH_URL}/auth/callback/google`;
    const tokenData = await exchangeCodeForToken(
      code,
      c.env.GOOGLE_CLIENT_ID,
      c.env.GOOGLE_CLIENT_SECRET,
      redirectUri,
      storedVerifier || ''
    );

    if (!tokenData) {
      return c.redirect(`${c.env.FRONTEND_URL}/login?error=token_exchange_failed`);
    }

    if (tokenData.idToken) {
      const idPayload = await verifyGoogleIdToken(tokenData.idToken, c.env.GOOGLE_CLIENT_ID, storedNonce || undefined);
      if (!idPayload) {
        return c.redirect(`${c.env.FRONTEND_URL}/login?error=invalid_id_token`);
      }
    }

    const googleUser = await getGoogleUserInfo(tokenData.accessToken);
    if (!googleUser) {
      return c.redirect(`${c.env.FRONTEND_URL}/login?error=failed_to_get_user_info`);
    }
    if (googleUser.emailVerified === false) {
      return c.redirect(`${c.env.FRONTEND_URL}/login?error=email_not_verified`);
    }

    const dbUser = UserSchema.parse(await c.env.DB.prepare(
      'SELECT * FROM users WHERE email = ?'
    ).bind(googleUser.email).first());

    if (!dbUser) {
      return c.redirect(`${c.env.FRONTEND_URL}/login?error=access_denied`);
    }

    // Format name with space between family and given name
    const formatName = (user: { family_name?: string; given_name?: string; name: string }): string => {
      if (user.family_name && user.given_name) {
        return `${user.family_name} ${user.given_name}`;
      } else if (user.name) {
        return user.name;
      } else {
        throw new Error('No name information available from Google OAuth');
      }
    };

    let formattedName: string;
    try {
      formattedName = formatName(googleUser);
    } catch (error) {
      console.error('Name formatting error:', error);
      return c.redirect(`${c.env.FRONTEND_URL}/login?error=name_formatting_failed`);
    }
    
    if (dbUser.name !== formattedName) {
      const now = new Date().toISOString();
      await c.env.DB.prepare(
        'UPDATE users SET name = ?, updated_at = ? WHERE email = ?'
      ).bind(
        formattedName,
        now,
        googleUser.email
      ).run();
    }

    const jwt = await generateJWT({
      id: dbUser.id,
      email: googleUser.email,
      name: formattedName,
      image: googleUser.image,
    }, c.env.AUTH_SECRET);

    setCookie(c, 'auth_token', jwt, {
      httpOnly: true,
      secure: c.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
      path: '/',
    });

    return c.redirect(`${c.env.FRONTEND_URL}/auth/callback`);
  } catch (error) {
    console.error('Auth callback error:', error);
    return c.redirect(`${c.env.FRONTEND_URL}/login?error=authentication_failed`);
  }
});

app.get('/auth/session', async (c) => {
  try {
    const token = getCookie(c, 'auth_token');
    
    if (!token) {
      return c.json({ user: null });
    }

    const payload = await verifyJWT(token, c.env.AUTH_SECRET);
    if (!payload) {
      return c.json({ user: null });
    }

    const dbUser = UserSchema.parse(await c.env.DB.prepare(
      'SELECT * FROM users WHERE id = ?'
    ).bind(payload.sub).first());

    if (!dbUser) {
      return c.json({ user: null });
    }

    return c.json({
      user: {
        id: dbUser.id,
        email: dbUser.email,
        name: dbUser.name,
        picture: payload.picture,
      }
    });
  } catch (error) {
    console.error('Session check error:', error);
    return c.json({ user: null });
  }
});

app.post('/auth/signout', async (c) => {
  try {
    deleteCookie(c, 'auth_token', {
      path: '/',
      httpOnly: true,
      secure: c.env.NODE_ENV === 'production',
      sameSite: 'lax',
    });

    return c.json({ success: true });
  } catch (error) {
    console.error('Signout error:', error);
    return c.json({ success: false, error: 'Signout failed' }, 500);
  }
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