import type { Bindings } from '../index';

export async function deleteExpiredEvents(env: Bindings): Promise<void> {
  const now = new Date();
  now.setUTCHours(15, 0, 0, 0);

  const expiredEvents = await env.DB.prepare(`
    SELECT id FROM events
    WHERE DATETIME(event_date, '+1 day') <= ?
  `).bind(now.toISOString()).all();

  for (const event of expiredEvents.results) {
    const entries = await env.DB.prepare(`
      SELECT DISTINCT group_id FROM entries WHERE event_id = ?
    `).bind(event.id).all();

    for (const entry of entries.results) {
      await env.DB.prepare(`
        UPDATE groups SET is_active = 0 WHERE id = ?
      `).bind(entry.group_id).run();
    }

    await env.DB.prepare('DELETE FROM events WHERE id = ?').bind(event.id).run();
  }
}
