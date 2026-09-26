import type { Bindings } from '../index';
import { withReservationScopeLock } from '../features/reservations/application/scope-lock';
import { createD1ReservationScopeLockRepository } from '../features/reservations/infrastructure/d1-scope-lock-repository';

export function withReservationLimitLock<T>(
  env: Bindings,
  userId: string,
  groupId: string | null,
  work: () => Promise<T>
): Promise<T> {
  return withReservationScopeLock({
    repository: createD1ReservationScopeLockRepository(env.DB),
    now: () => new Date(),
    id: () => crypto.randomUUID(),
    delay: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  }, userId, groupId, work);
}
