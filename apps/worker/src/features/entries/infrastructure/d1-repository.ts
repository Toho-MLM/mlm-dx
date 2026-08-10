import type { D1Database } from '@cloudflare/workers-types';
import type { EntryRepository } from '../application/repository';

export function createD1EntryRepository(db: D1Database): EntryRepository {
  return {
    async activeGroupsExist(ids) {
      if (!ids.length) return false;
      const placeholders = ids.map(() => '?').join(',');
      const rows = await db.prepare(`SELECT id FROM groups WHERE id IN (${placeholders}) AND is_active = TRUE`)
        .bind(...ids).all<{ id: string }>();
      return rows.results.length === ids.length;
    },
    async userGroupIds(userId) {
      const rows = await db.prepare(`
        SELECT DISTINCT g.id FROM groups g JOIN group_member_instruments gmi ON g.id = gmi.group_id
        WHERE gmi.user_id = ? AND g.is_active = TRUE
      `).bind(userId).all<{ id: string }>();
      return rows.results.map((row) => row.id);
    },
    async findEventState(eventId) {
      const row = await db.prepare('SELECT group_limit, is_entry_accepting FROM events WHERE id = ?')
        .bind(eventId).first<{ group_limit: number; is_entry_accepting: number | boolean }>();
      return row ? { groupLimit: Number(row.group_limit), isEntryAccepting: Boolean(row.is_entry_accepting) } : null;
    },
    async existingGroupIds(eventId) {
      const rows = await db.prepare('SELECT group_id FROM entries WHERE event_id = ?')
        .bind(eventId).all<{ group_id: string }>();
      return rows.results.map((row) => row.group_id);
    },
    async groupMemberIds(groupId) {
      const rows = await db.prepare('SELECT DISTINCT user_id FROM group_member_instruments WHERE group_id = ?')
        .bind(groupId).all<{ user_id: string }>();
      return rows.results.map((row) => row.user_id);
    },
    async memberEntryCount(eventId, memberId) {
      const row = await db.prepare(`
        SELECT COUNT(DISTINCT e.group_id) AS count FROM entries e
        WHERE e.event_id = ? AND e.group_id IN (
          SELECT DISTINCT group_id FROM group_member_instruments WHERE user_id = ?
        )
      `).bind(eventId, memberId).first<{ count: number }>();
      return Number(row?.count ?? 0);
    },
    async memberDisplayName(memberId) {
      const row = await db.prepare('SELECT nickname, name FROM users WHERE id = ?')
        .bind(memberId).first<{ nickname: string | null; name: string }>();
      return row ? row.nickname || row.name : '不明';
    },
    async create(eventId, groupIds, entryIds, now) {
      await db.batch(groupIds.map((groupId, index) => db.prepare(`
        INSERT OR IGNORE INTO entries (id, event_id, group_id, position, created_at, updated_at)
        SELECT ?, ?, ?, COALESCE(MAX(position), 0) + 1, ?, ? FROM entries WHERE event_id = ?
      `).bind(entryIds[index], eventId, groupId, now, now, eventId)));
    },
    async hasLimitViolation(eventId) {
      return Boolean(await db.prepare(`
        SELECT gmi.user_id FROM entries entry
        INNER JOIN events event ON event.id = entry.event_id
        INNER JOIN group_member_instruments gmi ON gmi.group_id = entry.group_id
        WHERE entry.event_id = ? AND event.group_limit > 0
        GROUP BY gmi.user_id, event.group_limit
        HAVING COUNT(DISTINCT entry.group_id) > event.group_limit LIMIT 1
      `).bind(eventId).first());
    },
    async deleteMany(ids) {
      if (!ids.length) return;
      const placeholders = ids.map(() => '?').join(',');
      await db.prepare(`DELETE FROM entries WHERE id IN (${placeholders})`).bind(...ids).run();
    },
    async list(groupIds, eventId) {
      if (!groupIds.length) return [];
      const placeholders = groupIds.map(() => '?').join(',');
      const where = eventId ? `e.event_id = ? AND e.group_id IN (${placeholders})` : `e.group_id IN (${placeholders})`;
      const params = eventId ? [eventId, ...groupIds] : groupIds;
      const rows = await db.prepare(`
        SELECT e.id, e.event_id, e.group_id, e.note FROM entries e
        WHERE ${where} ORDER BY e.created_at DESC
      `).bind(...params).all<Record<string, unknown>>();
      return rows.results;
    },
    async findGroupId(entryId) {
      const row = await db.prepare('SELECT group_id FROM entries WHERE id = ?')
        .bind(entryId).first<{ group_id: string }>();
      return row?.group_id ?? null;
    },
    async delete(entryId) {
      await db.prepare('DELETE FROM entries WHERE id = ?').bind(entryId).run();
    },
    async updateNote(entryId, note) {
      await db.prepare('UPDATE entries SET note = ? WHERE id = ?').bind(note, entryId).run();
    },
  };
}

