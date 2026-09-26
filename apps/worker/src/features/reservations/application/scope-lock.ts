export interface ReservationScopeLockRepository {
  tryAcquire(scopeKey: string, owner: string, expiresAt: string, now: string): Promise<boolean>;
  release(scopeKey: string, owner: string): Promise<void>;
}

export class ReservationScopeBusyError extends Error {
  constructor() { super('RESERVATION_BUSY'); }
}

export async function withReservationScopeLock<T>(deps: {
  repository: ReservationScopeLockRepository;
  now: () => Date;
  id: () => string;
  delay: (milliseconds: number) => Promise<void>;
}, userId: string, groupId: string | null, work: () => Promise<T>): Promise<T> {
  const scopeKey = groupId ? `GROUP:${groupId}` : `PERSONAL:${userId}`;
  const owner = deps.id();
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const now = deps.now();
    const acquired = await deps.repository.tryAcquire(
      scopeKey, owner, new Date(now.getTime() + 30_000).toISOString(), now.toISOString()
    );
    if (acquired) {
      try {
        return await work();
      } finally {
        try {
          await deps.repository.release(scopeKey, owner);
        } catch (error) {
          console.error('Failed to release reservation scope lock:', error);
        }
      }
    }
    if (attempt < 29) await deps.delay(50);
  }
  throw new ReservationScopeBusyError();
}
