import type { D1Database } from '@cloudflare/workers-types';
import type { EventRepository, EventWrite } from '../application/repository';

function values(event: EventWrite) {
  return [
    event.title, event.eventDate, event.entryDeadline, event.isEntryAccepting ? 1 : 0,
    event.setlistDeadline, event.isSetlistAccepting ? 1 : 0, event.groupLimit, event.songLimit,
  ] as const;
}

export function createD1EventRepository(db: D1Database): EventRepository {
  return {
    async list() {
      const rows = await db.prepare(`
        SELECT id, title, event_date, entry_deadline, is_entry_accepting,
               setlist_deadline, is_setlist_accepting, group_limit, song_limit
        FROM events ORDER BY event_date ASC
      `).all<Record<string, unknown>>();
      return (rows.results ?? []).map((row) => ({
        ...row,
        is_entry_accepting: Boolean(row.is_entry_accepting),
        is_setlist_accepting: Boolean(row.is_setlist_accepting),
        group_limit: Number(row.group_limit),
        song_limit: Number(row.song_limit),
      }));
    },
    async findLimits(id) {
      const row = await db.prepare('SELECT group_limit, song_limit FROM events WHERE id = ?')
        .bind(id).first<{ group_limit: number; song_limit: number }>();
      return row ? { groupLimit: Number(row.group_limit), songLimit: Number(row.song_limit) } : null;
    },
    async hasGroupLimitViolation(id, groupLimit) {
      const row = await db.prepare(`
        SELECT gmi.user_id FROM entries entry
        INNER JOIN group_member_instruments gmi ON gmi.group_id = entry.group_id
        WHERE entry.event_id = ? GROUP BY gmi.user_id
        HAVING COUNT(DISTINCT entry.group_id) > ? LIMIT 1
      `).bind(id, groupLimit).first();
      return Boolean(row);
    },
    async create(event, createdAt) {
      await db.prepare(`
        INSERT INTO events
          (id, title, event_date, entry_deadline, is_entry_accepting, setlist_deadline,
           is_setlist_accepting, group_limit, song_limit, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(event.id, ...values(event), createdAt, createdAt).run();
    },
    async update(event, previous, updatedAt) {
      const enforceLoweredLimit = event.groupLimit < previous.groupLimit ? 1 : 0;
      const statements = [db.prepare(`
        UPDATE events
        SET title = ?, event_date = ?, entry_deadline = ?, is_entry_accepting = ?,
            setlist_deadline = ?, is_setlist_accepting = ?, group_limit = ?, song_limit = ?, updated_at = ?
        WHERE id = ? AND (
          ? = 0 OR NOT EXISTS (
            SELECT 1 FROM entries entry
            INNER JOIN group_member_instruments gmi ON gmi.group_id = entry.group_id
            WHERE entry.event_id = events.id GROUP BY gmi.user_id
            HAVING COUNT(DISTINCT entry.group_id) > ?
          )
        )
      `).bind(...values(event), updatedAt, event.id, enforceLoweredLimit, event.groupLimit)];
      if (event.songLimit < previous.songLimit) {
        statements.push(db.prepare(`
          DELETE FROM setlist_items
          WHERE position > ? AND entry_id IN (SELECT id FROM entries WHERE event_id = ?)
            AND EXISTS (
              SELECT 1 FROM events ev WHERE ev.id = ? AND (
                ? = 0 OR NOT EXISTS (
                  SELECT 1 FROM entries entry
                  INNER JOIN group_member_instruments gmi ON gmi.group_id = entry.group_id
                  WHERE entry.event_id = ev.id GROUP BY gmi.user_id
                  HAVING COUNT(DISTINCT entry.group_id) > ?
                )
              )
            )
        `).bind(event.songLimit, event.id, event.id, enforceLoweredLimit, event.groupLimit));
      }
      const [result] = await db.batch(statements);
      return Number(result.meta.changes ?? 0) > 0;
    },
    async delete(id) {
      await db.prepare('DELETE FROM events WHERE id = ?').bind(id).run();
    },
    async deleteExpired(cutoff) {
      const events = await db.prepare(`SELECT id FROM events WHERE DATETIME(event_date, '+1 day') <= ?`)
        .bind(cutoff).all<{ id: string }>();
      for (const event of events.results) {
        const entries = await db.prepare('SELECT DISTINCT group_id FROM entries WHERE event_id = ?')
          .bind(event.id).all<{ group_id: string }>();
        const statements = entries.results.map((entry) =>
          db.prepare('UPDATE groups SET is_active = 0 WHERE id = ?').bind(entry.group_id));
        statements.push(db.prepare('DELETE FROM events WHERE id = ?').bind(event.id));
        await db.batch(statements);
      }
    },
  };
}
