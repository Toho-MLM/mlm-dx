import type { Bindings } from '../index';
import { createD1EventRepository } from '../features/events/infrastructure/d1-repository';

export async function deleteExpiredEvents(env: Bindings): Promise<void> {
  const now = new Date();
  now.setUTCHours(15, 0, 0, 0);

  await createD1EventRepository(env.DB).deleteExpired(now.toISOString());
}
