import type { SessionRepository, UserRow } from './repository';

export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface SessionTokenProvider {
  generateId(): string;
  generateToken(): string;
  hashToken(token: string): Promise<string>;
}

export type IssuedSession = {
  token: string;
  expiresAt: string;
};

export function isSessionTokenFormat(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

export async function issueSession(
  repository: SessionRepository,
  tokenProvider: SessionTokenProvider,
  userId: string,
  now: Date,
): Promise<IssuedSession> {
  const token = tokenProvider.generateToken();
  if (!isSessionTokenFormat(token)) {
    throw new Error('Session token provider returned an invalid token');
  }

  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000).toISOString();
  await repository.deleteExpiredSessions(createdAt);
  await repository.createSession({
    id: tokenProvider.generateId(),
    token_hash: await tokenProvider.hashToken(token),
    user_id: userId,
    expires_at: expiresAt,
    created_at: createdAt,
  });

  return { token, expiresAt };
}

export async function resolveSession(
  repository: SessionRepository,
  tokenProvider: Pick<SessionTokenProvider, 'hashToken'>,
  token: string,
  now: Date,
): Promise<UserRow | null> {
  if (!isSessionTokenFormat(token)) return null;
  const tokenHash = await tokenProvider.hashToken(token);
  return repository.findUserBySessionTokenHash(tokenHash, now.toISOString());
}

export async function revokeSession(
  repository: SessionRepository,
  tokenProvider: Pick<SessionTokenProvider, 'hashToken'>,
  token: string,
): Promise<void> {
  if (!isSessionTokenFormat(token)) return;
  await repository.deleteSessionByTokenHash(await tokenProvider.hashToken(token));
}
