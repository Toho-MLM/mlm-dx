import type { D1Database } from '@cloudflare/workers-types';
import type { ReservationScopeLockRepository } from '../application/scope-lock';

export function createD1ReservationScopeLockRepository(db: D1Database): ReservationScopeLockRepository {
  return {
    async tryAcquire(scopeKey, owner, expiresAt, now) {
      const result = await db.prepare(`
        INSERT INTO reservation_scope_locks (scope_key, owner, expires_at)
        VALUES (?, ?, ?)
        ON CONFLICT(scope_key) DO UPDATE SET
          owner = excluded.owner, expires_at = excluded.expires_at
        WHERE reservation_scope_locks.expires_at <= ?
      `).bind(scopeKey, owner, expiresAt, now).run();
      return Number(result.meta.changes ?? 0) > 0;
    },
    async release(scopeKey, owner) {
      await db.prepare('DELETE FROM reservation_scope_locks WHERE scope_key = ? AND owner = ?')
        .bind(scopeKey, owner).run();
    },
  };
}
