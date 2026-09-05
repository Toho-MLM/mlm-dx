import type { D1Database } from '@cloudflare/workers-types';
import type { SetlistRepository } from '../application/repository';

type SetlistRow = {
  entry_id: string; entry_event_id: string; entry_group_id: string; entry_note: string | null;
  group_name: string | null; item_position: number | null; item_title: string | null; item_artist: string | null;
};

export function createD1SetlistRepository(db: D1Database): SetlistRepository {
  return {
    async findEntryGroupId(entryId) {
      const row = await db.prepare('SELECT group_id FROM entries WHERE id = ?')
        .bind(entryId).first<{ group_id: string }>();
      return row?.group_id ?? null;
    },
    async userGroupIds(userId) {
      const rows = await db.prepare(`
        SELECT DISTINCT g.id FROM groups g JOIN group_member_instruments gmi ON g.id = gmi.group_id
        WHERE gmi.user_id = ? AND g.is_active = TRUE
      `).bind(userId).all<{ id: string }>();
      return rows.results.map((row) => row.id);
    },
    async findEventState(entryId) {
      const row = await db.prepare(`
        SELECT ev.is_setlist_accepting, ev.song_limit FROM entries e
        JOIN events ev ON ev.id = e.event_id WHERE e.id = ?
      `).bind(entryId).first<{ is_setlist_accepting: number | boolean; song_limit: number }>();
      return row ? { songLimit: Number(row.song_limit), isAccepting: Boolean(row.is_setlist_accepting) } : null;
    },
    async createItem(input) {
      const result = await db.prepare(`
        INSERT INTO setlist_items (id, entry_id, position, title, artist, created_at, updated_at)
        SELECT ?, ?, ?, ?, ?, ?, ?
        WHERE NOT EXISTS (SELECT 1 FROM setlist_items WHERE entry_id = ? AND position = ?)
          AND EXISTS (
            SELECT 1 FROM entries current_entry
            INNER JOIN events current_event ON current_event.id = current_entry.event_id
            WHERE current_entry.id = ? AND (? = 1 OR current_event.is_setlist_accepting = TRUE)
              AND (? = 0 OR (? <= current_event.song_limit AND
                (SELECT COUNT(*) FROM setlist_items WHERE entry_id = ? AND position > 0) < current_event.song_limit))
          )
      `).bind(input.id, input.entryId, input.position, input.title, input.artist, input.now, input.now,
        input.entryId, input.position, input.entryId, input.admin ? 1 : 0,
        input.position, input.position, input.entryId).run();
      return Number(result.meta.changes ?? 0) > 0;
    },
    async isAccepting(entryId) {
      const row = await db.prepare(`
        SELECT ev.is_setlist_accepting FROM entries e INNER JOIN events ev ON ev.id = e.event_id WHERE e.id = ?
      `).bind(entryId).first<{ is_setlist_accepting: number | boolean }>();
      return row ? Boolean(row.is_setlist_accepting) : null;
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
    async listEvent(eventId, groupIds) {
      if (groupIds && !groupIds.length) return [];
      const filter = groupIds ? ` AND e.group_id IN (${groupIds.map(() => '?').join(',')})` : '';
      const rows = await db.prepare(`
        SELECT e.id AS entry_id, e.event_id AS entry_event_id, e.group_id AS entry_group_id,
               e.note AS entry_note, g.name AS group_name, s.position AS item_position,
               s.title AS item_title, s.artist AS item_artist
        FROM entries e LEFT JOIN groups g ON g.id = e.group_id
        LEFT JOIN setlist_items s ON s.entry_id = e.id
        WHERE e.event_id = ?${filter} ORDER BY e.created_at ASC, s.position ASC
      `).bind(eventId, ...(groupIds ?? [])).all<SetlistRow>();
      const result = new Map<string, { entry: Record<string, unknown>; group_name: string; setlist_items: Array<{ position: number; title: string; artist: string }> }>();
      for (const row of rows.results) {
        if (!result.has(row.entry_id)) result.set(row.entry_id, {
          entry: { id: row.entry_id, event_id: row.entry_event_id, group_id: row.entry_group_id, note: row.entry_note },
          group_name: row.group_name || '不明なグループ', setlist_items: [],
        });
        if (row.item_position !== null && row.item_title !== null) result.get(row.entry_id)!.setlist_items.push({
          position: Number(row.item_position), title: row.item_title, artist: row.item_artist || '',
        });
      }
      return [...result.values()].map((value) => ({
        ...value, setlist_items: value.setlist_items.sort((a, b) => a.position - b.position),
      }));
    },
    async replace(entryId, note, hasSE, items, now, createId) {
      const statements = [
        db.prepare('DELETE FROM setlist_items WHERE entry_id = ?').bind(entryId),
        db.prepare('UPDATE entries SET note = ?, updated_at = ? WHERE id = ?').bind(note, now, entryId),
      ];
      items.forEach((item, index) => statements.push(db.prepare(`
        INSERT INTO setlist_items (id, entry_id, position, title, artist, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(createId(), entryId, hasSE ? index : index + 1, item.title, item.artist || '', now, now)));
      await db.batch(statements);
    },
  };
}
