import { sign, verify } from 'hono/jwt';
import { z } from 'zod';

const GoogleUserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  given_name: z.string().optional(),
  family_name: z.string().optional(),
  picture: z.string().url().optional(),
  verified_email: z.boolean().optional(),
  email_verified: z.boolean().optional(),
});

const GoogleTokenResponseSchema = z.object({
  access_token: z.string(),
  id_token: z.string().optional(),
  token_type: z.string(),
  expires_in: z.number(),
});

const GoogleJWKSchema = z.object({
  keys: z.array(z.object({
    kid: z.string(),
    alg: z.string(),
    kty: z.string(),
    use: z.string(),
    n: z.string(),
    e: z.string(),
  })),
});

const GoogleIdTokenPayloadSchema = z.object({
  iss: z.string(),
  aud: z.string(),
  sub: z.string(),
  email: z.string().email(),
  name: z.string(),
  picture: z.string().url().optional(),
  exp: z.number(),
  iat: z.number(),
  nonce: z.string().optional(),
});

const CustomJWTPayloadSchema = z.object({
  sub: z.string(),
  email: z.string().email(),
  name: z.string(),
  nickname: z.string().nullable(),
  picture: z.string().url().optional(),
  iat: z.number(),
  exp: z.number(),
});

type GoogleUser = z.infer<typeof GoogleUserSchema>;
type GoogleTokenResponse = z.infer<typeof GoogleTokenResponseSchema>;
type GoogleJWKS = z.infer<typeof GoogleJWKSchema>;
type GoogleIdTokenPayload = z.infer<typeof GoogleIdTokenPayloadSchema>;

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  given_name?: string;
  family_name?: string;
  image?: string;
  emailVerified?: boolean;
}

export interface CustomJWTPayload {
  sub: string;
  email: string;
  name: string;
  nickname: string | null;
  picture?: string;
  iat: number;
  exp: number;
}

export function generateState(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

export function generateNonce(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

export function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(digest as ArrayBuffer);
  let str = '';
  for (let i = 0; i < bytes.byteLength; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function generateJWT(user: AuthUser, nickname: string | null, secret: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: user.id,
    email: user.email,
    name: user.name,
    nickname: nickname,
    picture: user.image,
    iat: now,
    exp: now + (7 * 24 * 60 * 60),
  };
  
  return await sign(payload, secret);
}

export async function verifyJWT(token: string, secret: string): Promise<CustomJWTPayload | null> {
  try {
    const payload = await verify(token, secret);
    return CustomJWTPayloadSchema.parse(payload);
  } catch (error) {
    console.error('JWT verification failed:', error);
    return null;
  }
}

export async function getGoogleUserInfo(accessToken: string): Promise<AuthUser | null> {
  try {
    const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Google API error: ${response.status}`);
    }

    const userInfo = GoogleUserSchema.parse(await response.json());
    
    return {
      id: userInfo.id,
      email: userInfo.email,
      name: userInfo.name,
      given_name: userInfo.given_name,
      family_name: userInfo.family_name,
      image: userInfo.picture,
      emailVerified: (userInfo.verified_email ?? userInfo.email_verified) === true,
    };
  } catch (error) {
    console.error('Failed to get Google user info:', error);
    return null;
  }
}

export async function exchangeCodeForToken(code: string, clientId: string, clientSecret: string, redirectUri: string, codeVerifier: string): Promise<{ accessToken: string; idToken?: string } | null> {
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        code_verifier: codeVerifier,
      }),
    });

    if (!response.ok) {
      throw new Error(`Token exchange failed: ${response.status}`);
    }

    const tokenData = GoogleTokenResponseSchema.parse(await response.json());
    
    return {
      accessToken: tokenData.access_token,
      idToken: tokenData.id_token,
    };
  } catch (error) {
    console.error('Token exchange failed:', error);
    return null;
  }
}

export function createGoogleAuthUrl(clientId: string, redirectUri: string, state: string, codeChallenge: string, nonce: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'offline',
    prompt: 'consent',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    nonce,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

function base64urlToUint8Array(input: string): Uint8Array {
  input = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = input.length % 4;
  if (pad) input += '='.repeat(4 - pad);
  const decoded = atob(input);
  const bytes = new Uint8Array(decoded.length);
  for (let i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i);
  return bytes;
}

let cachedJwks: GoogleJWKS | null = null;
let cachedJwksAt = 0;

async function getGoogleJwks(): Promise<GoogleJWKS> {
  const now = Date.now();
  if (cachedJwks && now - cachedJwksAt < 60_000) return cachedJwks;
  const res = await fetch('https://www.googleapis.com/oauth2/v3/certs');
  if (!res.ok) throw new Error('Failed to fetch JWKS');
  cachedJwks = GoogleJWKSchema.parse(await res.json());
  cachedJwksAt = now;
  return cachedJwks;
}

export async function verifyGoogleIdToken(idToken: string, clientId: string, expectedNonce?: string): Promise<GoogleIdTokenPayload | null> {
  try {
    const [h, p, s] = idToken.split('.');
    if (!h || !p || !s) return null;
    const header = JSON.parse(new TextDecoder().decode(base64urlToUint8Array(h)));
    const payload = GoogleIdTokenPayloadSchema.parse(JSON.parse(new TextDecoder().decode(base64urlToUint8Array(p))));
    if (header.alg !== 'RS256') return null;
    const jwks = await getGoogleJwks();
    const jwk = jwks.keys.find((k) => k.kid === header.kid && k.alg === 'RS256');
    if (!jwk) return null;
    const key = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    );
    const data = new TextEncoder().encode(`${h}.${p}`);
    const sig = base64urlToUint8Array(s);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, sig as BufferSource, data as BufferSource);
    if (!ok) return null;
    const issOk = payload.iss === 'https://accounts.google.com' || payload.iss === 'accounts.google.com';
    if (!issOk) return null;
    if (payload.aud !== clientId) return null;
    const nowSec = Math.floor(Date.now() / 1000);
    if (typeof payload.exp === 'number' && nowSec >= payload.exp) return null;
    if (expectedNonce && payload.nonce !== expectedNonce) return null;
    return payload;
  } catch {
    return null;
  }
}
