import type { D1Database, ExecutionContext } from '@cloudflare/workers-types';
import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Bindings, Variables } from './index';
import { signOut } from './routes/auth-signout';

const sessionToken = 'a'.repeat(43);
const request = () => new Request('https://dx.example/auth/signout', {
  method: 'POST',
  headers: { Cookie: `__Host-mlm_dx_session=${sessionToken}` },
});
const context = {} as ExecutionContext;
const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();
app.post('/auth/signout', signOut);

function createEnv(run: () => Promise<unknown>): Bindings {
  const db = {
    prepare: vi.fn(() => ({
      bind: vi.fn(() => ({ run })),
    })),
  } as unknown as D1Database;
  return { DB: db, CORS_ORIGIN: '' } as Bindings;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /auth/signout', () => {
  it('D1のセッション失効後にCookieを削除する', async () => {
    const response = await app.fetch(request(), createEnv(async () => undefined), context);

    expect(response.status).toBe(200);
    expect(response.headers.get('Set-Cookie')).toContain('__Host-mlm_dx_session=');
  });

  it('D1のセッション失効に失敗した場合は再試行用のCookieを維持する', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await app.fetch(
      request(),
      createEnv(async () => { throw new Error('D1 unavailable'); }),
      context,
    );

    expect(response.status).toBe(500);
    expect(response.headers.get('Set-Cookie')).toBeNull();
    await expect(response.json()).resolves.toEqual({ success: false, error: 'SIGNOUT_FAILED' });
  });
});
