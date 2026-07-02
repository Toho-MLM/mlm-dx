import type { Bindings } from '../index';

export async function deleteOldMainBandDrafts(env: Bindings): Promise<void> {
  const now = new Date();
  now.setUTCHours(15, 0, 0, 0);
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - 30);

  await env.DB.prepare(`
    DELETE FROM main_band_drafts
    WHERE created_at < ?
  `).bind(cutoff.toISOString()).run();
}
