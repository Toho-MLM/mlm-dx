import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { SESSION_TTL_SECONDS } from '../features/auth/application/session';

const SECURE_SESSION_COOKIE = '__Host-mlm_dx_session';
const DEVELOPMENT_SESSION_COOKIE = 'mlm_dx_session';
const LEGACY_SESSION_COOKIE = 'auth_token';

export function isSecureRequest(c: Context): boolean {
  return new URL(c.req.url).protocol === 'https:';
}

function sessionCookieName(c: Context): string {
  return isSecureRequest(c) ? SECURE_SESSION_COOKIE : DEVELOPMENT_SESSION_COOKIE;
}

export function getSessionCookie(c: Context): string | undefined {
  return getCookie(c, sessionCookieName(c));
}

export function hasLegacySessionCookie(c: Context): boolean {
  return getCookie(c, LEGACY_SESSION_COOKIE) !== undefined;
}

export function setSessionCookie(c: Context, token: string): void {
  const secure = isSecureRequest(c);
  setCookie(c, sessionCookieName(c), token, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    maxAge: SESSION_TTL_SECONDS,
    path: '/',
  });
  deleteCookie(c, LEGACY_SESSION_COOKIE, {
    path: '/',
    httpOnly: true,
    secure,
    sameSite: 'lax',
  });
}

export function clearSessionCookies(c: Context): void {
  const common = { path: '/', httpOnly: true, sameSite: 'lax' as const };
  deleteCookie(c, SECURE_SESSION_COOKIE, { ...common, secure: true });
  deleteCookie(c, DEVELOPMENT_SESSION_COOKIE, { ...common, secure: false });
  deleteCookie(c, LEGACY_SESSION_COOKIE, { ...common, secure: isSecureRequest(c) });
}
