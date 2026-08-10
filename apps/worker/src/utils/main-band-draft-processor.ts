import type { Bindings } from '../index';
import { createD1BandDraftRepository } from '../features/band-draft/infrastructure/d1-repository';

export async function deleteOldMainBandDrafts(env: Bindings): Promise<void> {
  const now = new Date();
  now.setUTCHours(15, 0, 0, 0);
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - 30);

  await createD1BandDraftRepository(env.DB).deleteOlderThan(cutoff.toISOString());
}
