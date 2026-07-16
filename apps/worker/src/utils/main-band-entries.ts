import type { Bindings } from '../index'

type EventModeRow = {
  group_limit: number
}

type MainGroupRow = {
  id: string
}

export async function ensureMainBandEntries(env: Bindings, eventId: string): Promise<void> {
  const event = await env.DB.prepare(`
    SELECT group_limit
    FROM events
    WHERE id = ?
  `).bind(eventId).first<EventModeRow>()

  if (!event || Number(event.group_limit) !== 0) {
    return
  }

  const groups = await env.DB.prepare(`
    SELECT id
    FROM groups
    WHERE is_main = TRUE AND is_active = TRUE
  `).all<MainGroupRow>()

  if (groups.results.length === 0) {
    return
  }

  const now = new Date().toISOString()
  await env.DB.batch(groups.results.map((group) => env.DB.prepare(`
    INSERT OR IGNORE INTO entries (id, event_id, group_id, position, created_at, updated_at)
    VALUES (?, ?, ?, NULL, ?, ?)
  `).bind(crypto.randomUUID(), eventId, group.id, now, now)))
}
