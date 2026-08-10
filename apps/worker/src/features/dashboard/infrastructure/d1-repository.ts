import type { D1Database } from '@cloudflare/workers-types';
import type { DashboardRepository, EntryOpportunityRow, EmptySetlistRow, EventDeadlineRow, ReservationScheduleRow, TimelineIncompleteRow } from '../application/repository';

const normalizeEvent = (row: Record<string, unknown>): EventDeadlineRow => ({
  event_id: String(row.event_id), event_title: String(row.event_title),
  ...(row.event_date ? { event_date: String(row.event_date) } : {}),
  entry_deadline: String(row.entry_deadline), setlist_deadline: String(row.setlist_deadline),
  is_entry_accepting: Boolean(row.is_entry_accepting), is_setlist_accepting: Boolean(row.is_setlist_accepting),
  song_limit: Number(row.song_limit),
});

export function createD1DashboardRepository(db: D1Database): DashboardRepository {
  return {
    async entryOpportunities(userId, w) {
      const rows = await db.prepare(`
        SELECT ev.id AS event_id, ev.title AS event_title, ev.entry_deadline AS due_at,
               COUNT(DISTINCT g.id) AS eligible_group_count
        FROM events ev INNER JOIN groups g ON g.is_active = TRUE AND g.is_main = FALSE
        INNER JOIN group_member_instruments gmi ON gmi.group_id = g.id AND gmi.user_id = ?
        LEFT JOIN entries en ON en.event_id = ev.id AND en.group_id = g.id
        WHERE ev.group_limit > 0 AND ev.is_entry_accepting = TRUE
          AND datetime(ev.entry_deadline) BETWEEN datetime(?) AND datetime(?)
          AND date(ev.event_date) >= date(?) AND en.id IS NULL
        GROUP BY ev.id, ev.title, ev.entry_deadline ORDER BY datetime(ev.entry_deadline) ASC LIMIT ?
      `).bind(userId, w.nowIso, w.horizonIso, w.todayJst, w.limit).all<EntryOpportunityRow>();
      return rows.results;
    },
    async emptySetlists(userId, w) {
      const rows = await db.prepare(`
        WITH expected_entries AS (
          SELECT en.id AS entry_id, en.event_id, en.group_id, g.name AS group_name
          FROM entries en INNER JOIN groups g ON g.id = en.group_id AND g.is_active = TRUE
          INNER JOIN group_member_instruments gmi ON gmi.group_id = en.group_id AND gmi.user_id = ?
          UNION
          SELECT en.id, ev.id, g.id, g.name FROM events ev
          INNER JOIN groups g ON g.is_main = TRUE AND g.is_active = TRUE
          INNER JOIN group_member_instruments gmi ON gmi.group_id = g.id AND gmi.user_id = ?
          LEFT JOIN entries en ON en.event_id = ev.id AND en.group_id = g.id WHERE ev.group_limit = 0
        )
        SELECT ev.id AS event_id, ev.title AS event_title, ev.setlist_deadline AS due_at,
               expected.group_id, expected.group_name
        FROM expected_entries expected INNER JOIN events ev ON ev.id = expected.event_id
        LEFT JOIN setlist_items si ON si.entry_id = expected.entry_id AND si.position > 0
        WHERE ev.is_setlist_accepting = TRUE AND ev.song_limit > 0
          AND datetime(ev.setlist_deadline) BETWEEN datetime(?) AND datetime(?) AND date(ev.event_date) >= date(?)
        GROUP BY ev.id, ev.title, ev.setlist_deadline, expected.group_id, expected.group_name
        HAVING COUNT(si.id) = 0 ORDER BY datetime(ev.setlist_deadline) ASC LIMIT ?
      `).bind(userId, userId, w.nowIso, w.horizonIso, w.todayJst, w.limit).all<EmptySetlistRow>();
      return rows.results;
    },
    async reservations(kind, userId, w) {
      const sql = kind === 'hall' ? `
        SELECT r.id AS reservation_id, COALESCE(g.name, COALESCE(u.nickname, u.name), '個人予約') AS title,
               r.start_time AS start_at, r.end_time AS end_at, r.state
        FROM reservations r LEFT JOIN groups g ON g.id = r.group_id LEFT JOIN users u ON u.id = r.user_id
        WHERE r.state IN ('PENDING', 'CONFIRMED') AND datetime(r.start_time) BETWEEN datetime(?) AND datetime(?)
          AND (r.user_id = ? OR EXISTS (SELECT 1 FROM group_member_instruments gmi WHERE gmi.group_id = r.group_id AND gmi.user_id = ?))
        ORDER BY datetime(r.start_time) ASC LIMIT ?
      ` : `
        SELECT er.id AS reservation_id,
          COALESCE(g.name, COALESCE(u.nickname, u.name), '個人予約') || '（' ||
          COALESCE(json_extract(es.room_names, '$[' || (er.room_number - 1) || ']'), '外部スタジオ') || '）' AS title,
          er.start_time AS start_at, er.end_time AS end_at, er.state
        FROM external_reservations er INNER JOIN external_studios es ON es.id = er.external_studio_id
        LEFT JOIN groups g ON g.id = er.group_id LEFT JOIN users u ON u.id = er.user_id
        WHERE er.state IN ('PENDING', 'CONFIRMED') AND datetime(er.start_time) BETWEEN datetime(?) AND datetime(?)
          AND (er.user_id = ? OR EXISTS (SELECT 1 FROM group_member_instruments gmi WHERE gmi.group_id = er.group_id AND gmi.user_id = ?))
        ORDER BY datetime(er.start_time) ASC LIMIT ?
      `;
      const rows = await db.prepare(sql).bind(w.nowIso, w.horizonIso, userId, userId, w.limit).all<ReservationScheduleRow>();
      return rows.results;
    },
    async deadlineEvents(w) {
      const rows = await db.prepare(`
        SELECT id AS event_id, title AS event_title, entry_deadline, setlist_deadline,
               is_entry_accepting, is_setlist_accepting, song_limit FROM events
        WHERE date(event_date) >= date(?) AND (
          (is_entry_accepting = TRUE AND datetime(entry_deadline) BETWEEN datetime(?) AND datetime(?)) OR
          (song_limit > 0 AND is_setlist_accepting = TRUE AND datetime(setlist_deadline) BETWEEN datetime(?) AND datetime(?)))
        ORDER BY event_date ASC
      `).bind(w.todayJst, w.nowIso, w.horizonIso, w.nowIso, w.horizonIso).all<Record<string, unknown>>();
      return rows.results.map(normalizeEvent);
    },
    async overdueEvents(w) {
      const rows = await db.prepare(`
        SELECT id AS event_id, title AS event_title, event_date, entry_deadline, setlist_deadline,
               is_entry_accepting, is_setlist_accepting, song_limit FROM events
        WHERE date(event_date) >= date(?) AND (
          (is_entry_accepting = TRUE AND datetime(entry_deadline) < datetime(?)) OR
          (song_limit > 0 AND is_setlist_accepting = TRUE AND datetime(setlist_deadline) < datetime(?)))
        ORDER BY event_date ASC
      `).bind(w.todayJst, w.nowIso, w.nowIso).all<Record<string, unknown>>();
      return rows.results.map(normalizeEvent);
    },
    async incompleteTimelines(w) {
      const rows = await db.prepare(`
        WITH expected AS (
          SELECT ev.id AS event_id, ev.title AS event_title, ev.event_date, en.id AS entry_id, en.position, en.start_time, en.end_time
          FROM events ev INNER JOIN entries en ON en.event_id = ev.id
          WHERE ev.group_limit > 0 AND date(ev.event_date) BETWEEN date(?) AND date(?)
          UNION ALL
          SELECT ev.id, ev.title, ev.event_date, en.id, en.position, en.start_time, en.end_time
          FROM events ev INNER JOIN groups g ON g.is_main = TRUE AND g.is_active = TRUE
          LEFT JOIN entries en ON en.event_id = ev.id AND en.group_id = g.id
          WHERE ev.group_limit = 0 AND date(ev.event_date) BETWEEN date(?) AND date(?)
        )
        SELECT event_id, event_title, event_date, COUNT(*) AS missing_count FROM expected
        WHERE entry_id IS NULL OR position IS NULL OR start_time IS NULL OR end_time IS NULL
        GROUP BY event_id, event_title, event_date ORDER BY event_date ASC LIMIT ?
      `).bind(w.todayJst, w.horizonDateJst, w.todayJst, w.horizonDateJst, w.limit).all<TimelineIncompleteRow>();
      return rows.results;
    },
  };
}
