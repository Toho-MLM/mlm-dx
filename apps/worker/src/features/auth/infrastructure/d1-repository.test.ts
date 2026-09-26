import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import type { D1Database, ExecutionContext } from '@cloudflare/workers-types';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import type { Bindings, Variables } from '../../../index';
import { signOut } from '../../../routes/auth-signout';
import { webCryptoSessionTokenProvider } from './session-token';

describe('signout with D1', () => {
  it('実DBのセッション行を削除し、期限切れCookieを返す', async () => {
    const sqlite = new DatabaseSync(':memory:');
    sqlite.exec(readFileSync(new URL('../../../../schema.sql', import.meta.url), 'utf8'));
    const userId = '00000000-0000-4000-8000-000000000001';
    const sessionToken = 'a'.repeat(43);
    const tokenHash = await webCryptoSessionTokenProvider.hashToken(sessionToken);
    sqlite.prepare('INSERT INTO users (id, name, email, grade, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(userId, 'Test', 'test@example.invalid', 1, '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z');
    sqlite.prepare('INSERT INTO auth_sessions (id, token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
      .run('00000000-0000-4000-8000-000000000002', tokenHash, userId,
        '2027-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z');
    const db = {
      prepare: (sql: string) => ({
        bind: (...values: string[]) => ({ run: async () => sqlite.prepare(sql).run(...values) }),
      }),
    } as unknown as D1Database;
    const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();
    app.post('/auth/signout', signOut);
    const response = await app.fetch(new Request('https://dx.example/auth/signout', {
      method: 'POST', headers: { Cookie: `__Host-mlm_dx_session=${sessionToken}` },
    }), { DB: db, CORS_ORIGIN: '' } as Bindings, {} as ExecutionContext);

    expect(response.status).toBe(200);
    expect(sqlite.prepare('SELECT id FROM auth_sessions WHERE token_hash = ?').get(tokenHash)).toBeUndefined();
    expect(response.headers.get('Set-Cookie')).toMatch(/__Host-mlm_dx_session=;[^,]*Max-Age=0/i);
    sqlite.close();
  });
});
