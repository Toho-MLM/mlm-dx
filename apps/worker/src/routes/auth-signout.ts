import type { Context } from 'hono';
import type { Bindings, Variables } from '../index';
import { revokeSession } from '../features/auth/application/session';
import { createD1AuthRepository } from '../features/auth/infrastructure/d1-repository';
import { webCryptoSessionTokenProvider } from '../features/auth/infrastructure/session-token';
import { clearSessionCookies, getSessionCookie } from '../middleware/session-cookie';

export async function signOut(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
  try {
    const token = getSessionCookie(c);
    if (token) {
      await revokeSession(createD1AuthRepository(c.env.DB), webCryptoSessionTokenProvider, token);
    }
    clearSessionCookies(c);

    return c.json({ success: true });
  } catch (error) {
    console.error('Signout error:', error);
    return c.json({ success: false, error: 'SIGNOUT_FAILED' }, 500);
  }
}
