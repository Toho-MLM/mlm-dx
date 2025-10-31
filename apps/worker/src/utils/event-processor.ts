import type { Bindings } from '../index';

export async function deleteExpiredEvents(env: Bindings): Promise<void> {
  const now = new Date();
  now.setUTCHours(15, 0, 0, 0); // JST 0:00基準

  // event_dateの2日後0時（JST）を過ぎたイベントを取得
  const expiredEvents = await env.DB.prepare(`
    SELECT id FROM events
    WHERE DATETIME(event_date, '+2 day') <= ?
  `).bind(now.toISOString()).all();

  for (const event of expiredEvents.results) {
    // 1. 該当eventに紐づくentriesの自由バンド取得
    const entries = await env.DB.prepare(`
      SELECT DISTINCT group_id FROM entries WHERE event_id = ?
    `).bind(event.id).all();

    // 2. 各グループのis_active=falseにUPDATE
    for (const entry of entries.results) {
      await env.DB.prepare(`
        UPDATE groups SET is_active = 0 WHERE id = ?
      `).bind(entry.group_id).run();
    }

    // 3. event削除
    await env.DB.prepare('DELETE FROM events WHERE id = ?').bind(event.id).run();
  }
}
