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
    async exceededMemberNames(eventId, groupIds, groupLimit) {
      if (groupIds.length === 0) return [];
      const placeholders = groupIds.map(() => '?').join(',');
      const rows = await db.prepare(`
        SELECT COALESCE(u.nickname, u.name) AS name
        FROM users u
        INNER JOIN (
          SELECT user_id, COUNT(DISTINCT group_id) AS additions
          FROM group_member_instruments
          WHERE group_id IN (${placeholders})
          GROUP BY user_id
        ) added ON added.user_id = u.id
        WHERE added.additions + (
          SELECT COUNT(DISTINCT entry.group_id)
          FROM entries entry
          INNER JOIN group_member_instruments member ON member.group_id = entry.group_id
          WHERE entry.event_id = ? AND member.user_id = u.id
        ) > ?
        ORDER BY u.id
      `).bind(...groupIds, eventId, groupLimit).all<{ name: string }>();
      return rows.results.map((row) => row.name);
    },
    async create(eventId, groupIds, entryIds, now) {
      await db.batch(groupIds.map((groupId, index) => db.prepare(`
        INSERT OR IGNORE INTO entries (id, event_id, group_id, position, created_at, updated_at)
        SELECT ?, ?, ?, COALESCE((SELECT MAX(position) FROM entries WHERE event_id = ?), 0) + 1, ?, ?
        WHERE NOT EXISTS (SELECT 1 FROM entries WHERE event_id = ? AND group_id = ?)
      `).bind(entryIds[index], eventId, groupId, eventId, now, now, eventId, groupId)));
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
