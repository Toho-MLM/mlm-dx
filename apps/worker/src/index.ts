import { Hono } from 'hono';
import type { D1Database, ExecutionContext, ScheduledEvent } from '@cloudflare/workers-types';
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
import { eventRoutes } from './routes/events';
import { entriesRoutes } from './routes/entries';
import { setlistRoutes } from './routes/setlist';
import { timelineRoutes } from './routes/timeline';
import type { User } from './types';
import { UserSchema } from './schemas';
import { processDailyReservations } from './utils/reservation-processor';
import { deleteExpiredEvents } from './utils/event-processor';

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
    return c.json({ error: 'AUTHENTICATION_FAILED' }, 500);
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

    const dbUserRaw = await c.env.DB.prepare(
      'SELECT * FROM users WHERE email = ?'
    ).bind(googleUser.email).first();

    if (!dbUserRaw) {
      return c.redirect(`${c.env.FRONTEND_URL}/login?error=access_denied`);
    }

    let parsedInstruments: string[] = [];
    try {
      parsedInstruments = JSON.parse(String(dbUserRaw.instruments || '[]')) as string[];
    } catch (error) {
      console.error('Error parsing instruments:', error);
      parsedInstruments = [];
    }

    const dbUser = UserSchema.parse({
      ...dbUserRaw,
      instruments: parsedInstruments,
      grade: Number(dbUserRaw.grade),
      student_number: (dbUserRaw.email as string).substring(0, 6).toUpperCase(),
    });

    // Format name with space between family and given name
    const formatName = (user: { family_name?: string; given_name?: string; name: string | null }): string => {
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
    
    if (!dbUser.name || dbUser.name !== formattedName) {
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
    }, dbUser.nickname, c.env.AUTH_SECRET);

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

    const dbUserRaw = await c.env.DB.prepare(
      'SELECT * FROM users WHERE id = ?'
    ).bind(payload.sub).first();

    if (!dbUserRaw) {
      return c.json({ user: null });
    }

    let parsedInstruments: string[] = [];
    try {
      parsedInstruments = JSON.parse(String(dbUserRaw.instruments || '[]')) as string[];
    } catch (error) {
      console.error('Error parsing instruments:', error);
      parsedInstruments = [];
    }

    const dbUser = UserSchema.parse({
      ...dbUserRaw,
      instruments: parsedInstruments,
      grade: Number(dbUserRaw.grade),
      student_number: (dbUserRaw.email as string).substring(0, 6).toUpperCase(),
    });

    return c.json({
      user: {
        id: dbUser.id,
        email: dbUser.email,
        name: dbUser.name,
        nickname: payload.nickname,
        picture: payload.picture,
        role: dbUser.role,
        grade: dbUser.grade,
        instruments: dbUser.instruments,
        created_at: dbUser.created_at,
        updated_at: dbUser.updated_at,
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
    return c.json({ success: false, error: 'SIGNOUT_FAILED' }, 500);
  }
});

app.route('/me', userRoutes);
app.route('/groups', groupRoutes);
app.route('/members', memberRoutes);
app.route('/reservations', reservationRoutes);
app.route('/archive', archiveRoutes);
app.route('/events', eventRoutes);
app.route('/entries', entriesRoutes);
app.route('/setlist', setlistRoutes);
app.route('/timeline', timelineRoutes);

export default {
  async fetch(request: Request, env: Bindings, ctx: ExecutionContext): Promise<Response> {
    return app.fetch(request, env, ctx);
  },
  
  async scheduled(event: ScheduledEvent, env: Bindings, ctx: ExecutionContext): Promise<void> {
    switch (event.cron) {
      case "0 15 * * *":
        await processDailyReservations(env);
        break;
      case "0 16 * * *":
        await deleteExpiredEvents(env);
        break;
    }
  }
};