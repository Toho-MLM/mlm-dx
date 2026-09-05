import type { D1Database } from '@cloudflare/workers-types';
import type { TimelineRepository } from '../application/repository';

type TimelineRow = {
  entry_id: string;
  group_id: string;
  start_time: string | null;
  end_time: string | null;
  position: number | null;
  group_name: string | null;
};

export function createD1TimelineRepository(db: D1Database): TimelineRepository {
  return {
    async eventExists(eventId) {
      return Boolean(await db.prepare('SELECT id FROM events WHERE id = ?').bind(eventId).first());
    },
    async ensureMainBandEntries(eventId, now, createId) {
      const event = await db.prepare('SELECT group_limit FROM events WHERE id = ?')
        .bind(eventId).first<{ group_limit: number }>();
      if (!event || Number(event.group_limit) !== 0) return;

      const groups = await db.prepare('SELECT id FROM groups WHERE main_index IS NOT NULL AND is_active = TRUE ORDER BY main_index ASC')
        .all<{ id: string }>();
      if (!groups.results.length) return;

      await db.batch(groups.results.map((group) => db.prepare(`
        INSERT OR IGNORE INTO entries (id, event_id, group_id, position, created_at, updated_at)
        VALUES (?, ?, ?, NULL, ?, ?)
      `).bind(createId(), eventId, group.id, now, now)));
    },
    async list(eventId) {
      const rows = await db.prepare(`
        SELECT e.id AS entry_id, e.group_id, e.start_time, e.end_time, e.position, g.name AS group_name
        FROM entries e LEFT JOIN groups g ON g.id = e.group_id
        WHERE e.event_id = ?
        ORDER BY e.position IS NULL, e.position ASC, e.created_at ASC
      `).bind(eventId).all<TimelineRow>();
      const result = { configured: [], unconfigured: [] } as Awaited<ReturnType<TimelineRepository['list']>>;
      for (const row of rows.results) {
        const item = {
          entry_id: row.entry_id,
          group_id: row.group_id,
          group_name: row.group_name || '不明なグループ',
          start_time: row.start_time || null,
          end_time: row.end_time || null,
          position: row.position === null ? null : Number(row.position),
        };
        (item.position === null ? result.unconfigured : result.configured).push(item);
      }
      return result;
    },
    async entriesBelongToEvent(eventId, entryIds) {
      if (!entryIds.length) return true;
      const placeholders = entryIds.map(() => '?').join(',');
      const row = await db.prepare(`
        SELECT COUNT(*) AS count FROM entries WHERE event_id = ? AND id IN (${placeholders})
      `).bind(eventId, ...entryIds).first<{ count: number }>();
      return Number(row?.count ?? 0) === new Set(entryIds).size;
    },
    async update(items, updatedAt) {
      if (!items.length) return;
      await db.batch(items.map((item) => db.prepare(`
        UPDATE entries SET position = ?, start_time = ?, end_time = ?, updated_at = ? WHERE id = ?
      `).bind(item.position, item.startTime ?? null, item.endTime ?? null, updatedAt, item.entryId)));
    },
  };
}
