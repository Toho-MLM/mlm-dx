import { Hono } from 'hono';
import type { D1Database, DurableObjectNamespace, ExecutionContext, ScheduledEvent } from '@cloudflare/workers-types';
import type { Context } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { z } from 'zod';
import { generateState, generateNonce, generateCodeVerifier, generateCodeChallenge, createGoogleAuthUrl, exchangeCodeForToken, getGoogleUserInfo, verifyGoogleIdToken, generateJWT, verifyJWT } from './auth';
import type { AuthUser } from './auth';
import { userRoutes } from './routes/users';
import { groupRoutes } from './routes/groups';
import { memberRoutes } from './routes/members';
import { reservationRoutes } from './routes/reservations';
import { externalReservationRoutes, externalStudioRoutes } from './routes/external';
import { archiveRoutes } from './routes/archive';
import { eventRoutes } from './routes/events';
import { entriesRoutes } from './routes/entries';
import { setlistRoutes } from './routes/setlist';
import { timelineRoutes } from './routes/timeline';
import { bandMainDraftRoutes } from './routes/band-main-draft';
export { BandDraftRoom } from './durable-objects/band-draft-room';
export { ReservationRoom } from './durable-objects/reservation-room';
import type { User } from './types';
import { UserSchema } from './schemas';
import { processTodayReservations, processPastReservations, deleteOldReservations } from './utils/reservation-processor';
import { deleteExpiredExternals, processPastExternalReservations, processTodayExternalReservations } from './utils/external-processor';
import { deleteExpiredEvents } from './utils/event-processor';
import { deleteOldMainBandDrafts } from './utils/main-band-draft-processor';
import { requireAuth } from './middleware/auth';
import { createRegistrationOptions, verifyRegistration, createAuthenticationOptions, verifyAuthentication, nowISO, futureISO, encodeBase64Url } from './utils/passkey';

export type Bindings = {
  DB: D1Database;
  AUTH_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  CORS_ORIGIN: string;
  FRONTEND_URL: string;
  NODE_ENV: string;
  AUTH_URL: string;
  SMTP_HOST?: string;
  SMTP_PORT?: string;
  SMTP_SECURITY?: string;
  SMTP_USER?: string;
  SMTP_PASSWORD?: string;
  SMTP_FROM_EMAIL?: string;
  SMTP_FROM_NAME?: string;
  BAND_DRAFT_ROOM: DurableObjectNamespace;
  RESERVATION_ROOM: DurableObjectNamespace;
};

export type Variables = {
  user: User;
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

export type UserRow = {
  id: string;
  name: string;
  nickname: string | null;
  email: string;
  avatar: string | null;
  instruments: string;
  grade: number;
  role: string;
  created_at: string;
  updated_at: string;
};

type PasskeyRow = {
  id: string;
  user_id: string;
  credential_id: string;
  public_key: string;
  counter: number;
  device_type: string | null;
  backed_up: number | null;
  transports: string | null;
  attestation_format: string | null;
  created_at: string;
  updated_at: string;
};

type PasskeyChallengeRow = {
  id: string;
  user_id: string | null;
  email: string | null;
  challenge: string;
  type: string;
  expires_at: string;
  created_at: string;
};

const OneTapCredentialSchema = z.object({
  credential: z.string().min(1),
});

async function fetchPasskeys(env: Bindings, userId: string): Promise<PasskeyRow[]> {
  const rows = await env.DB.prepare('SELECT * FROM passkeys WHERE user_id = ?').bind(userId).all<PasskeyRow>();
  return rows.results ?? [];
}

async function fetchPasskeyByCredential(env: Bindings, credentialId: string): Promise<PasskeyRow | null> {
  const row = await env.DB.prepare('SELECT * FROM passkeys WHERE credential_id = ?').bind(credentialId).first<PasskeyRow>();
  return row ?? null;
}

async function fetchChallenge(env: Bindings, id: string): Promise<PasskeyChallengeRow | null> {
  const row = await env.DB.prepare('SELECT * FROM passkey_challenges WHERE id = ?').bind(id).first<PasskeyChallengeRow>();
  return row ?? null;
}

async function deleteChallenge(env: Bindings, id: string): Promise<void> {
  await env.DB.prepare('DELETE FROM passkey_challenges WHERE id = ?').bind(id).run();
}

function safeParseTransports(value: string | null): string[] {
  if (!value) {
    return [];
  }
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
  } catch {
    return [];
  }
}

function formatGoogleName(user: { family_name?: string; given_name?: string; name: string | null }): string {
  if (user.family_name && user.given_name) {
    return `${user.family_name} ${user.given_name}`;
  }
  if (user.name) {
    return user.name;
  }

  throw new Error('No name information available from Google');
}

async function signInGoogleUser(c: Context<{ Bindings: Bindings; Variables: Variables }>, googleUser: AuthUser): Promise<{ success: true } | { success: false; error: string }> {
  if (googleUser.emailVerified === false) {
    return { success: false, error: 'EMAIL_NOT_VERIFIED' };
  }

  const dbUserRaw = await c.env.DB.prepare(
    'SELECT * FROM users WHERE email = ?'
  ).bind(googleUser.email).first<UserRow>();

  if (!dbUserRaw) {
    return { success: false, error: 'ACCESS_DENIED' };
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
    student_number: dbUserRaw.email.substring(0, 6).toUpperCase(),
  });

  let formattedName: string;
  try {
    formattedName = formatGoogleName(googleUser);
  } catch (error) {
    console.error('Name formatting error:', error);
    return { success: false, error: 'NAME_FORMATTING_FAILED' };
  }

  const now = new Date().toISOString();
  const shouldUpdateName = !dbUser.name || dbUser.name !== formattedName;
  const shouldUpdateAvatar = googleUser.image && (dbUserRaw?.avatar !== googleUser.image);

  if (shouldUpdateName || shouldUpdateAvatar) {
    if (shouldUpdateName && shouldUpdateAvatar) {
      await c.env.DB.prepare(
        'UPDATE users SET name = ?, avatar = ?, updated_at = ? WHERE email = ?'
      ).bind(
        formattedName,
        googleUser.image || null,
        now,
        googleUser.email
      ).run();
    } else if (shouldUpdateName) {
      await c.env.DB.prepare(
        'UPDATE users SET name = ?, updated_at = ? WHERE email = ?'
      ).bind(
        formattedName,
        now,
        googleUser.email
      ).run();
    } else if (shouldUpdateAvatar) {
      await c.env.DB.prepare(
        'UPDATE users SET avatar = ?, updated_at = ? WHERE email = ?'
      ).bind(
        googleUser.image || null,
        now,
        googleUser.email
      ).run();
    }
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

  return { success: true };
}

function googleSignInErrorToLoginError(error: string): string {
  const map: Record<string, string> = {
    EMAIL_NOT_VERIFIED: 'email_not_verified',
    ACCESS_DENIED: 'access_denied',
    NAME_FORMATTING_FAILED: 'name_formatting_failed',
  };

  return map[error] || 'authentication_failed';
}

function googleSignInErrorStatus(error: string): 400 | 401 | 403 | 500 {
  if (error === 'EMAIL_NOT_VERIFIED' || error === 'INVALID_CREDENTIAL') return 401;
  if (error === 'ACCESS_DENIED') return 403;
  if (error === 'NAME_FORMATTING_FAILED') return 400;
  return 500;
}

app.use('*', logger());
app.use('*', cors({
  origin: (origin: string | undefined, c: Context) => {
    if (!origin) {
      return null;
    }
    const allowedOrigins = c.env.CORS_ORIGIN.split(',').map((o: string) => o.trim());
    return allowedOrigins.includes(origin) ? origin : null;
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

    const signInResult = await signInGoogleUser(c, googleUser);
    if (!signInResult.success) {
      return c.redirect(`${c.env.FRONTEND_URL}/login?error=${googleSignInErrorToLoginError(signInResult.error)}`);
    }

    return c.redirect(`${c.env.FRONTEND_URL}/auth/callback`);
  } catch (error) {
    console.error('Auth callback error:', error);
    return c.redirect(`${c.env.FRONTEND_URL}/login?error=authentication_failed`);
  }
});

app.post('/auth/signin/google/onetap', async (c) => {
  try {
    const { credential } = OneTapCredentialSchema.parse(await c.req.json());
    const payload = await verifyGoogleIdToken(credential, c.env.GOOGLE_CLIENT_ID);

    if (!payload) {
      return c.json({ success: false, error: 'INVALID_CREDENTIAL' }, 401);
    }

    const signInResult = await signInGoogleUser(c, {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      given_name: payload.given_name,
      family_name: payload.family_name,
      image: payload.picture,
      emailVerified: payload.email_verified !== false,
    });

    if (!signInResult.success) {
      return c.json(
        { success: false, error: signInResult.error },
        googleSignInErrorStatus(signInResult.error)
      );
    }

    return c.json({ success: true });
  } catch (error) {
    console.error('One Tap signin error:', error);
    if (error instanceof z.ZodError) {
      return c.json({ success: false, error: 'INVALID_INPUT' }, 400);
    }
    return c.json({ success: false, error: 'AUTHENTICATION_FAILED' }, 500);
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
    ).bind(payload.sub).first<UserRow>();

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
      student_number: dbUserRaw.email.substring(0, 6).toUpperCase(),
    });

    const avatarUrl = dbUserRaw?.avatar || payload.picture || undefined;
    return c.json({
      user: {
        id: dbUser.id,
        email: dbUser.email,
        name: dbUser.name,
        nickname: payload.nickname,
        picture: avatarUrl,
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

app.post('/auth/passkey/register/start', requireAuth, async (c) => {
  try {
    const user = c.get('user');
    await c.env.DB.prepare('DELETE FROM passkey_challenges WHERE expires_at < ?').bind(nowISO()).run();
    await c.env.DB.prepare('DELETE FROM passkey_challenges WHERE user_id = ? AND type = ?').bind(user.id, 'register').run();
    const passkeys = await fetchPasskeys(c.env, user.id);
    const options = await createRegistrationOptions(c.env, {
      id: user.id,
      email: user.email,
      name: user.name || user.email,
    }, passkeys);
    const challengeId = crypto.randomUUID();
    const createdAt = nowISO();
    const expiresAt = futureISO(10);
    await c.env.DB.prepare(
      'INSERT INTO passkey_challenges (id, user_id, email, challenge, type, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      challengeId,
      user.id,
      user.email,
      options.challenge,
      'register',
      expiresAt,
      createdAt
    ).run();
    return c.json({ challengeId, options });
  } catch (error) {
    console.error('Passkey register start error:', error);
    return c.json({ success: false, error: 'PASSKEY_START_FAILED' }, 500);
  }
});

app.post('/auth/passkey/register/finish', requireAuth, async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();
    const parsed = z.object({
      challengeId: z.string(),
      response: z.any(),
    }).parse(body);
    const challenge = await fetchChallenge(c.env, parsed.challengeId);
    if (!challenge || challenge.type !== 'register' || challenge.user_id !== user.id) {
      return c.json({ success: false, error: 'PASSKEY_CHALLENGE_NOT_FOUND' }, 400);
    }
    if (new Date(challenge.expires_at).getTime() < Date.now()) {
      await deleteChallenge(c.env, challenge.id);
      return c.json({ success: false, error: 'PASSKEY_CHALLENGE_EXPIRED' }, 400);
    }
    const verification = await verifyRegistration(c.env, challenge.challenge, parsed.response);
    if (!verification.verified || !verification.registrationInfo) {
      await deleteChallenge(c.env, challenge.id);
      return c.json({ success: false, error: 'PASSKEY_VERIFICATION_FAILED' }, 400);
    }
    const { registrationInfo } = verification;
    const { credential, credentialDeviceType, credentialBackedUp, fmt } = registrationInfo;
    if (!credential || !credential.id || !credential.publicKey) {
      console.error('[Passkey Register] Credential data missing', { 
        hasCredential: !!credential,
        hasId: !!credential?.id,
        hasPublicKey: !!credential?.publicKey
      });
      await deleteChallenge(c.env, challenge.id);
      return c.json({ success: false, error: 'PASSKEY_REGISTER_FAILED' }, 500);
    }
    const credentialId = typeof credential.id === 'string' 
      ? credential.id 
      : encodeBase64Url(credential.id as unknown as Uint8Array);
    const credentialPublicKey = encodeBase64Url(credential.publicKey as unknown as Uint8Array);
    const counter = credential.counter ?? 0;
    const credentialTransports = credential.transports ? JSON.stringify(credential.transports) : null;
    console.log('[Passkey Register] Credential extracted', { 
      credentialId,
      hasPublicKey: !!credentialPublicKey,
      counter,
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp
    });
    const existing = await c.env.DB.prepare('SELECT id FROM passkeys WHERE credential_id = ?').bind(credentialId).first<{ id: string }>();
    const timestamp = nowISO();
    if (existing) {
      await c.env.DB.prepare(
        'UPDATE passkeys SET user_id = ?, public_key = ?, counter = ?, device_type = ?, backed_up = ?, transports = ?, attestation_format = ?, updated_at = ? WHERE credential_id = ?'
      ).bind(
        user.id,
        credentialPublicKey,
        counter,
        credentialDeviceType ?? null,
        credentialBackedUp ? 1 : 0,
        credentialTransports,
        fmt ?? null,
        timestamp,
        credentialId
      ).run();
    } else {
      await c.env.DB.prepare(
        'INSERT INTO passkeys (id, user_id, credential_id, public_key, counter, device_type, backed_up, transports, attestation_format, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(
        crypto.randomUUID(),
        user.id,
        credentialId,
        credentialPublicKey,
        counter,
        credentialDeviceType ?? null,
        credentialBackedUp ? 1 : 0,
        credentialTransports,
        fmt ?? null,
        timestamp,
        timestamp
      ).run();
    }
    await deleteChallenge(c.env, challenge.id);
    console.log('[Passkey Register] Registration successful', { 
      credentialId,
      userId: user.id,
      action: existing ? 'updated' : 'created'
    });
    return c.json({ success: true });
  } catch (error) {
    console.error('[Passkey Register] Registration error:', error);
    if (error instanceof Error) {
      console.error('[Passkey Register] Error details:', { 
        message: error.message, 
        stack: error.stack 
      });
    }
    return c.json({ success: false, error: 'PASSKEY_REGISTER_FAILED' }, 500);
  }
});

app.post('/auth/passkey/login/options', async (c) => {
  try {
    await c.env.DB.prepare('DELETE FROM passkey_challenges WHERE expires_at < ?').bind(nowISO()).run();
    const options = await createAuthenticationOptions(c.env);
    const challengeId = crypto.randomUUID();
    const createdAt = nowISO();
    const expiresAt = futureISO(10);
    await c.env.DB.prepare(
      'INSERT INTO passkey_challenges (id, user_id, email, challenge, type, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      challengeId,
      null,
      null,
      options.challenge,
      'login',
      expiresAt,
      createdAt
    ).run();
    return c.json({ success: true, challengeId, options });
  } catch (error) {
    console.error('Passkey login options error:', error);
    return c.json({ success: false });
  }
});

app.post('/auth/passkey/login/finish', async (c) => {
  try {
    const body = await c.req.json();
    const parsed = z.object({
      challengeId: z.string(),
      response: z.any(),
    }).parse(body);
    console.log('[Passkey Login] Start verification', { challengeId: parsed.challengeId });
    const challenge = await fetchChallenge(c.env, parsed.challengeId);
    if (!challenge || challenge.type !== 'login') {
      console.error('[Passkey Login] Challenge not found or invalid type', { 
        challengeId: parsed.challengeId, 
        challenge: challenge ? { id: challenge.id, type: challenge.type } : null 
      });
      return c.json({ success: false });
    }
    if (new Date(challenge.expires_at).getTime() < Date.now()) {
      console.error('[Passkey Login] Challenge expired', { 
        challengeId: parsed.challengeId, 
        expiresAt: challenge.expires_at,
        now: new Date().toISOString()
      });
      await deleteChallenge(c.env, challenge.id);
      return c.json({ success: false });
    }
    const credentialId = typeof parsed.response?.id === 'string' ? parsed.response.id : null;
    if (!credentialId) {
      console.error('[Passkey Login] Credential ID missing in response', { 
        challengeId: parsed.challengeId,
        responseId: parsed.response?.id,
        responseType: typeof parsed.response?.id
      });
      await deleteChallenge(c.env, challenge.id);
      return c.json({ success: false });
    }
    console.log('[Passkey Login] Credential ID found', { credentialId });
    const matched = await fetchPasskeyByCredential(c.env, credentialId);
    if (!matched) {
      console.warn('[Passkey Login] Passkey not found for credential', { credentialId });
      await deleteChallenge(c.env, challenge.id);
      return c.json({ success: false, error: 'PASSKEY_NOT_FOUND' });
    }
    console.log('[Passkey Login] Passkey found', { passkeyId: matched.id, userId: matched.user_id });
    const userRow = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(matched.user_id).first<UserRow>();
    if (!userRow) {
      console.error('[Passkey Login] User not found', { userId: matched.user_id });
      await deleteChallenge(c.env, challenge.id);
      return c.json({ success: false });
    }
    console.log('[Passkey Login] User found', { userId: userRow.id, email: userRow.email });
    const verification = await verifyAuthentication(c.env, challenge.challenge, parsed.response, matched);
    if (!verification.verified || !verification.authenticationInfo) {
      console.error('[Passkey Login] Verification failed', { 
        verified: verification.verified,
        hasAuthInfo: !!verification.authenticationInfo,
        error: verification.verified === false ? 'Verification returned false' : 'No authentication info',
        passkeyId: matched.id,
        credentialId
      });
      await deleteChallenge(c.env, challenge.id);
      return c.json({ success: false });
    }
    const { authenticationInfo } = verification;
    console.log('[Passkey Login] Verification successful', { 
      newCounter: authenticationInfo.newCounter,
      passkeyId: matched.id
    });
    await c.env.DB.prepare(
      'UPDATE passkeys SET counter = ?, updated_at = ? WHERE id = ?'
    ).bind(
      authenticationInfo.newCounter,
      nowISO(),
      matched.id
    ).run();
    const avatarUrl = userRow.avatar || undefined;
    const jwt = await generateJWT({
      id: userRow.id,
      email: userRow.email,
      name: userRow.name,
      image: avatarUrl,
    }, userRow.nickname ?? null, c.env.AUTH_SECRET);
    setCookie(c, 'auth_token', jwt, {
      httpOnly: true,
      secure: c.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
      path: '/',
    });
    await deleteChallenge(c.env, challenge.id);
    console.log('[Passkey Login] Login successful', { userId: userRow.id, email: userRow.email });
    return c.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('[Passkey Login] Validation error', { issues: error.issues });
      return c.json({ success: false });
    }
    console.error('[Passkey Login] Unexpected error:', error);
    if (error instanceof Error) {
      console.error('[Passkey Login] Error details:', { 
        message: error.message, 
        stack: error.stack 
      });
    }
    return c.json({ success: false });
  }
});

app.get('/auth/passkey/status', requireAuth, async (c) => {
  try {
    const user = c.get('user');
    const passkeys = await fetchPasskeys(c.env, user.id);
    return c.json({ success: true, registered: passkeys.length > 0 });
  } catch (error) {
    console.error('Passkey status error:', error);
    return c.json({ success: false, error: 'PASSKEY_STATUS_FAILED' }, 500);
  }
});

app.get('/auth/passkey/credentials', requireAuth, async (c) => {
  try {
    const user = c.get('user');
    await c.env.DB.prepare('DELETE FROM passkey_challenges WHERE expires_at < ?').bind(nowISO()).run();
    const rows = await c.env.DB.prepare(
      'SELECT id, credential_id, device_type, backed_up, transports, attestation_format, created_at, updated_at FROM passkeys WHERE user_id = ? ORDER BY created_at DESC'
    ).bind(user.id).all<PasskeyRow>();
    const passkeys = (rows.results ?? []).map((row) => ({
      id: row.id,
      credential_id: row.credential_id,
      device_type: row.device_type,
      backed_up: row.backed_up === 1,
      transports: safeParseTransports(row.transports),
      attestation_format: row.attestation_format,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));
    return c.json({ success: true, passkeys });
  } catch (error) {
    console.error('Passkey list error:', error);
    return c.json({ success: false, error: 'PASSKEY_LIST_FAILED' }, 500);
  }
});

app.delete('/auth/passkey/credentials/:id', requireAuth, async (c) => {
  try {
    const user = c.get('user');
    const id = c.req.param('id');
    if (!id) {
      return c.json({ success: false });
    }
    const result = await c.env.DB.prepare('DELETE FROM passkeys WHERE id = ? AND user_id = ?').bind(id, user.id).run();
    const changes = result.meta?.changes ?? 0;
    if (changes === 0) {
      return c.json({ success: false });
    }
    return c.json({ success: true });
  } catch (error) {
    console.error('Passkey delete error:', error);
    return c.json({ success: false });
  }
});

app.get('/auth/check-first-user', async (c) => {
  try {
    const userCount = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM users'
    ).first<{ count: number }>();

    const count = userCount?.count ?? 0;
    return c.json({ canCreate: count === 0 });
  } catch (error) {
    console.error('Error checking first user:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

app.post('/auth/create-first-user', async (c) => {
  try {
    const userCount = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM users'
    ).first<{ count: number }>();

    const count = userCount?.count ?? 0;
    if (count > 0) {
      return c.json({ success: false, error: 'USERS_ALREADY_EXIST' }, 403);
    }

    const requestData = z.object({
      name: z.string().min(1),
      email: z.string().email(),
      grade: z.number().min(1).max(6),
    }).parse(await c.req.json());

    const normalizedEmail = requestData.email.trim().toLowerCase();

    const existing = await c.env.DB.prepare(
      'SELECT id FROM users WHERE lower(email) = lower(?)'
    ).bind(normalizedEmail).first();
    if (existing) {
      return c.json({ success: false, error: 'EMAIL_ALREADY_EXISTS' }, 409);
    }

    const now = new Date().toISOString();
    const newId = crypto.randomUUID();
    
    await c.env.DB.prepare(`
      INSERT INTO users (id, name, nickname, email, grade, instruments, role, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      newId,
      requestData.name,
      null,
      normalizedEmail,
      requestData.grade,
      JSON.stringify([]),
      'ADM',
      now,
      now
    ).run();
    
    return c.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ success: false, error: 'INVALID_REQUEST_DATA' }, 400);
    }
    
    if (error && typeof error === 'object' && 'message' in error) {
      const errorMessage = String(error.message);
      if (errorMessage.includes('UNIQUE constraint failed') || errorMessage.includes('email')) {
        return c.json({ success: false, error: 'EMAIL_ALREADY_EXISTS' }, 409);
      }
    }
    
    console.error('Error creating first user:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

app.route('/me', userRoutes);
app.route('/groups', groupRoutes);
app.route('/members', memberRoutes);
app.route('/reservations', reservationRoutes);
app.route('/reservation/external', externalStudioRoutes);
app.route('/reservations/external', externalReservationRoutes);
app.route('/archive', archiveRoutes);
app.route('/events', eventRoutes);
app.route('/entries', entriesRoutes);
app.route('/setlist', setlistRoutes);
app.route('/timeline', timelineRoutes);
app.route('/band/main/draft', bandMainDraftRoutes);

export default {
  async fetch(request: Request, env: Bindings, ctx: ExecutionContext): Promise<Response> {
    return app.fetch(request, env, ctx);
  },
  
  async scheduled(event: ScheduledEvent, env: Bindings, ctx: ExecutionContext): Promise<void> {
    void ctx;
    switch (event.cron) {
      case "0 15 * * *":
        await processPastReservations(env);
        await processPastExternalReservations(env);
        await processTodayReservations(env);
        await processTodayExternalReservations(env);
        await deleteExpiredEvents(env);
        await deleteOldReservations(env);
        await deleteExpiredExternals(env);
        await deleteOldMainBandDrafts(env);
        break;
    }
  }
};
