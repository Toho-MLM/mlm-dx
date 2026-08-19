import { describe, expect, it } from 'vitest';
import { issueSession, resolveSession, revokeSession, SESSION_TTL_SECONDS, type SessionTokenProvider } from './session';
import type { SessionRepository, SessionWrite, UserRow } from './repository';

const rawToken = 'a'.repeat(43);
const user: UserRow = {
  id: 'user-1', name: '山田 太郎', nickname: null, email: 'user@example.com', avatar: null,
  instruments: '[]', grade: 2, role: 'MBR', created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

function createFixture() {
  const sessions: SessionWrite[] = [];
  const repository: SessionRepository = {
    createSession: async (session) => { sessions.push(session); },
    findUserBySessionTokenHash: async (tokenHash, now) => {
      const session = sessions.find((item) => item.token_hash === tokenHash && item.expires_at > now);
      return session?.user_id === user.id ? user : null;
    },
    deleteSessionByTokenHash: async (tokenHash) => {
      const index = sessions.findIndex((item) => item.token_hash === tokenHash);
      if (index >= 0) sessions.splice(index, 1);
    },
    deleteExpiredSessions: async (now) => {
      for (let index = sessions.length - 1; index >= 0; index -= 1) {
        if (sessions[index].expires_at <= now) sessions.splice(index, 1);
      }
    },
  };
  const tokenProvider: SessionTokenProvider = {
    generateId: () => 'session-1',
    generateToken: () => rawToken,
    hashToken: async (token) => `hash:${token}`,
  };
  return { repository, sessions, tokenProvider };
}

describe('server-side session', () => {
  it('平文トークンを保存せず、7日間のセッションを発行する', async () => {
    const { repository, sessions, tokenProvider } = createFixture();
    const now = new Date('2026-01-01T00:00:00.000Z');

    const issued = await issueSession(repository, tokenProvider, user.id, now);

    expect(issued.token).toBe(rawToken);
    expect(new Date(issued.expiresAt).getTime() - now.getTime()).toBe(SESSION_TTL_SECONDS * 1000);
    expect(sessions[0].token_hash).toBe(`hash:${rawToken}`);
    expect(JSON.stringify(sessions[0])).not.toContain(`"token":"${rawToken}"`);
  });

  it('有効なセッションからユーザーを解決し、失効後は解決しない', async () => {
    const { repository, tokenProvider } = createFixture();
    const now = new Date('2026-01-01T00:00:00.000Z');
    await issueSession(repository, tokenProvider, user.id, now);

    await expect(resolveSession(repository, tokenProvider, rawToken, now)).resolves.toEqual(user);
    await revokeSession(repository, tokenProvider, rawToken);
    await expect(resolveSession(repository, tokenProvider, rawToken, now)).resolves.toBeNull();
  });

  it('形式が不正なトークンではデータストアを参照しない', async () => {
    const { tokenProvider } = createFixture();
    const repository: SessionRepository = {
      createSession: async () => undefined,
      findUserBySessionTokenHash: async () => { throw new Error('must not be called'); },
      deleteSessionByTokenHash: async () => undefined,
      deleteExpiredSessions: async () => undefined,
    };

    await expect(resolveSession(repository, tokenProvider, 'invalid', new Date())).resolves.toBeNull();
  });
});
