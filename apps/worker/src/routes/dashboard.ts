import { Hono } from 'hono';
import {
  DashboardDataSchema,
  isAdmin,
  type DashboardAdminAction,
  type DashboardMemberAction,
  type DashboardScheduleItem,
  type ReservationState,
} from '@shared-schemas';
import { requireAuth } from '../middleware/auth';
import type { Bindings, Variables } from '../index';

const DASHBOARD_HORIZON_DAYS = 14;
const DASHBOARD_ITEM_LIMIT = 5;
const JAPAN_TIME_OFFSET_MS = 9 * 60 * 60 * 1000;

const dashboardRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

dashboardRoutes.use('*', requireAuth);

type EntryOpportunityRow = {
  event_id: string;
  event_title: string;
  due_at: string;
  eligible_group_count: number;
};

type EmptySetlistRow = {
  event_id: string;
  event_title: string;
  due_at: string;
  group_id: string;
  group_name: string;
};

type AdminEventRow = {
  event_id: string;
  event_title: string;
  event_date: string;
  entry_deadline: string;
  setlist_deadline: string;
  is_entry_accepting: number | boolean;
  is_setlist_accepting: number | boolean;
  song_limit: number;
};

type TimelineIncompleteRow = {
  event_id: string;
  event_title: string;
  event_date: string;
  missing_count: number;
};

type ReservationScheduleRow = {
  reservation_id: string;
  title: string;
  start_at: string;
  end_at: string;
  state: ReservationState;
};

type DeadlineScheduleRow = {
  event_id: string;
  event_title: string;
  entry_deadline: string;
  setlist_deadline: string;
  is_entry_accepting: number | boolean;
  is_setlist_accepting: number | boolean;
  song_limit: number;
};

function getMemberActionDate(action: DashboardMemberAction): string {
  return action.due_at;
}

function getAdminActionDate(action: DashboardAdminAction): string {
  return action.kind === 'TIMELINE_INCOMPLETE' ? action.event_date : action.due_at;
}

function getScheduleDate(item: DashboardScheduleItem): string {
  return item.kind === 'HALL_RESERVATION' || item.kind === 'EXTERNAL_RESERVATION'
    ? item.start_at
    : item.due_at;
}

function compareIsoDates(a: string, b: string): number {
  return new Date(a).getTime() - new Date(b).getTime();
}

function getJstDateString(date: Date): string {
  return new Date(date.getTime() + JAPAN_TIME_OFFSET_MS).toISOString().slice(0, 10);
}

dashboardRoutes.get('/', async (c) => {
  try {
    const user = c.get('user');
    const now = new Date();
    const horizon = new Date(now.getTime() + DASHBOARD_HORIZON_DAYS * 24 * 60 * 60 * 1000);
    const nowIso = now.toISOString();
    const horizonIso = horizon.toISOString();
    const todayJst = getJstDateString(now);
    const horizonDateJst = getJstDateString(horizon);

    const [entryOpportunities, emptySetlists, hallReservations, externalReservations, deadlineEvents] = await Promise.all([
      c.env.DB.prepare(`
        SELECT
          ev.id AS event_id,
          ev.title AS event_title,
          ev.entry_deadline AS due_at,
          COUNT(DISTINCT g.id) AS eligible_group_count
        FROM events ev
        INNER JOIN groups g ON g.is_active = TRUE AND g.is_main = FALSE
        INNER JOIN group_member_instruments gmi ON gmi.group_id = g.id AND gmi.user_id = ?
        LEFT JOIN entries en ON en.event_id = ev.id AND en.group_id = g.id
        WHERE ev.group_limit > 0
          AND ev.is_entry_accepting = TRUE
          AND datetime(ev.entry_deadline) >= datetime(?)
          AND datetime(ev.entry_deadline) <= datetime(?)
          AND date(ev.event_date) >= date(?)
          AND en.id IS NULL
        GROUP BY ev.id, ev.title, ev.entry_deadline
        ORDER BY datetime(ev.entry_deadline) ASC
        LIMIT ?
      `).bind(user.id, nowIso, horizonIso, todayJst, DASHBOARD_ITEM_LIMIT).all<EntryOpportunityRow>(),
      c.env.DB.prepare(`
        WITH expected_entries AS (
          SELECT en.id AS entry_id, en.event_id, en.group_id, g.name AS group_name
          FROM entries en
          INNER JOIN groups g ON g.id = en.group_id AND g.is_active = TRUE
          INNER JOIN group_member_instruments gmi ON gmi.group_id = en.group_id AND gmi.user_id = ?
          UNION
          SELECT en.id AS entry_id, ev.id AS event_id, g.id AS group_id, g.name AS group_name
          FROM events ev
          INNER JOIN groups g ON g.is_main = TRUE AND g.is_active = TRUE
          INNER JOIN group_member_instruments gmi ON gmi.group_id = g.id AND gmi.user_id = ?
          LEFT JOIN entries en ON en.event_id = ev.id AND en.group_id = g.id
          WHERE ev.group_limit = 0
        )
        SELECT
          ev.id AS event_id,
          ev.title AS event_title,
          ev.setlist_deadline AS due_at,
          expected.group_id,
          expected.group_name
        FROM expected_entries expected
        INNER JOIN events ev ON ev.id = expected.event_id
        LEFT JOIN setlist_items si ON si.entry_id = expected.entry_id AND si.position > 0
        WHERE ev.is_setlist_accepting = TRUE
          AND ev.song_limit > 0
          AND datetime(ev.setlist_deadline) >= datetime(?)
          AND datetime(ev.setlist_deadline) <= datetime(?)
          AND date(ev.event_date) >= date(?)
        GROUP BY ev.id, ev.title, ev.setlist_deadline, expected.group_id, expected.group_name
        HAVING COUNT(si.id) = 0
        ORDER BY datetime(ev.setlist_deadline) ASC
        LIMIT ?
      `).bind(user.id, user.id, nowIso, horizonIso, todayJst, DASHBOARD_ITEM_LIMIT).all<EmptySetlistRow>(),
      c.env.DB.prepare(`
        SELECT
          r.id AS reservation_id,
          COALESCE(g.name, COALESCE(u.nickname, u.name), '個人予約') AS title,
          r.start_time AS start_at,
          r.end_time AS end_at,
          r.state
        FROM reservations r
        LEFT JOIN groups g ON g.id = r.group_id
        LEFT JOIN users u ON u.id = r.user_id
        WHERE r.state IN ('PENDING', 'CONFIRMED')
          AND datetime(r.start_time) >= datetime(?)
          AND datetime(r.start_time) <= datetime(?)
          AND (
            r.user_id = ?
            OR EXISTS (
              SELECT 1
              FROM group_member_instruments gmi
              WHERE gmi.group_id = r.group_id AND gmi.user_id = ?
            )
          )
        ORDER BY datetime(r.start_time) ASC
        LIMIT ?
      `).bind(nowIso, horizonIso, user.id, user.id, DASHBOARD_ITEM_LIMIT).all<ReservationScheduleRow>(),
      c.env.DB.prepare(`
        SELECT
          er.id AS reservation_id,
          g.name || '（' || es.name || '）' AS title,
          er.start_time AS start_at,
          er.end_time AS end_at,
          er.state
        FROM external_reservations er
        INNER JOIN external_studios es ON es.id = er.external_studio_id
        INNER JOIN groups g ON g.id = er.group_id
        WHERE er.state IN ('PENDING', 'CONFIRMED')
          AND datetime(er.start_time) >= datetime(?)
          AND datetime(er.start_time) <= datetime(?)
          AND (
            er.user_id = ?
            OR EXISTS (
              SELECT 1
              FROM group_member_instruments gmi
              WHERE gmi.group_id = er.group_id AND gmi.user_id = ?
            )
          )
        ORDER BY datetime(er.start_time) ASC
        LIMIT ?
      `).bind(nowIso, horizonIso, user.id, user.id, DASHBOARD_ITEM_LIMIT).all<ReservationScheduleRow>(),
      c.env.DB.prepare(`
        SELECT
          id AS event_id,
          title AS event_title,
          entry_deadline,
          setlist_deadline,
          is_entry_accepting,
          is_setlist_accepting,
          song_limit
        FROM events
        WHERE date(event_date) >= date(?)
          AND (
            (is_entry_accepting = TRUE AND datetime(entry_deadline) >= datetime(?) AND datetime(entry_deadline) <= datetime(?))
            OR (song_limit > 0 AND is_setlist_accepting = TRUE AND datetime(setlist_deadline) >= datetime(?) AND datetime(setlist_deadline) <= datetime(?))
          )
        ORDER BY event_date ASC
      `).bind(todayJst, nowIso, horizonIso, nowIso, horizonIso).all<DeadlineScheduleRow>(),
    ]);

    const memberActions: DashboardMemberAction[] = [
      ...entryOpportunities.results.map((row) => ({
        kind: 'ENTRY_AVAILABLE' as const,
        event_id: row.event_id,
        event_title: row.event_title,
        due_at: row.due_at,
        eligible_group_count: Number(row.eligible_group_count),
      })),
      ...emptySetlists.results.map((row) => ({
        kind: 'SETLIST_EMPTY' as const,
        event_id: row.event_id,
        event_title: row.event_title,
        due_at: row.due_at,
        group_id: row.group_id,
        group_name: row.group_name,
      })),
    ].sort((a, b) => compareIsoDates(getMemberActionDate(a), getMemberActionDate(b))).slice(0, DASHBOARD_ITEM_LIMIT);

    let adminActions: DashboardAdminAction[] = [];
    if (isAdmin(user.role)) {
      const [overdueEvents, incompleteTimelines] = await Promise.all([
        c.env.DB.prepare(`
          SELECT
            id AS event_id,
            title AS event_title,
            event_date,
            entry_deadline,
            setlist_deadline,
            is_entry_accepting,
            is_setlist_accepting,
            song_limit
          FROM events
          WHERE date(event_date) >= date(?)
            AND (
              (is_entry_accepting = TRUE AND datetime(entry_deadline) < datetime(?))
              OR (song_limit > 0 AND is_setlist_accepting = TRUE AND datetime(setlist_deadline) < datetime(?))
            )
          ORDER BY event_date ASC
        `).bind(todayJst, nowIso, nowIso).all<AdminEventRow>(),
        c.env.DB.prepare(`
          WITH expected_timeline_rows AS (
            SELECT ev.id AS event_id, ev.title AS event_title, ev.event_date,
                   en.id AS entry_id, en.position, en.start_time, en.end_time
            FROM events ev
            INNER JOIN entries en ON en.event_id = ev.id
            WHERE ev.group_limit > 0 AND date(ev.event_date) >= date(?) AND date(ev.event_date) <= date(?)
            UNION ALL
            SELECT ev.id AS event_id, ev.title AS event_title, ev.event_date,
                   en.id AS entry_id, en.position, en.start_time, en.end_time
            FROM events ev
            INNER JOIN groups g ON g.is_main = TRUE AND g.is_active = TRUE
            LEFT JOIN entries en ON en.event_id = ev.id AND en.group_id = g.id
            WHERE ev.group_limit = 0 AND date(ev.event_date) >= date(?) AND date(ev.event_date) <= date(?)
          )
          SELECT event_id, event_title, event_date, COUNT(*) AS missing_count
          FROM expected_timeline_rows
          WHERE entry_id IS NULL OR position IS NULL OR start_time IS NULL OR end_time IS NULL
          GROUP BY event_id, event_title, event_date
          ORDER BY event_date ASC
          LIMIT ?
        `).bind(todayJst, horizonDateJst, todayJst, horizonDateJst, DASHBOARD_ITEM_LIMIT).all<TimelineIncompleteRow>(),
      ]);

      adminActions = [
        ...overdueEvents.results.flatMap((row): DashboardAdminAction[] => {
          const actions: DashboardAdminAction[] = [];
          if (Boolean(row.is_entry_accepting) && new Date(row.entry_deadline).getTime() < now.getTime()) {
            actions.push({
              kind: 'ENTRY_ACCEPTING_AFTER_DEADLINE',
              event_id: row.event_id,
              event_title: row.event_title,
              due_at: row.entry_deadline,
            });
          }
          if (row.song_limit > 0 && Boolean(row.is_setlist_accepting) && new Date(row.setlist_deadline).getTime() < now.getTime()) {
            actions.push({
              kind: 'SETLIST_ACCEPTING_AFTER_DEADLINE',
              event_id: row.event_id,
              event_title: row.event_title,
              due_at: row.setlist_deadline,
            });
          }
          return actions;
        }),
        ...incompleteTimelines.results.map((row) => ({
          kind: 'TIMELINE_INCOMPLETE' as const,
          event_id: row.event_id,
          event_title: row.event_title,
          event_date: row.event_date,
          missing_count: Number(row.missing_count),
        })),
      ].sort((a, b) => compareIsoDates(getAdminActionDate(a), getAdminActionDate(b))).slice(0, DASHBOARD_ITEM_LIMIT);
    }

    const scheduleItems: DashboardScheduleItem[] = [
      ...hallReservations.results.map((row) => ({
        kind: 'HALL_RESERVATION' as const,
        ...row,
      })),
      ...externalReservations.results.map((row) => ({
        kind: 'EXTERNAL_RESERVATION' as const,
        ...row,
      })),
      ...deadlineEvents.results.flatMap((row): DashboardScheduleItem[] => {
        const items: DashboardScheduleItem[] = [];
        const entryDeadline = new Date(row.entry_deadline).getTime();
        const setlistDeadline = new Date(row.setlist_deadline).getTime();
        if (Boolean(row.is_entry_accepting) && entryDeadline >= now.getTime() && entryDeadline <= horizon.getTime()) {
          items.push({
            kind: 'ENTRY_DEADLINE',
            event_id: row.event_id,
            event_title: row.event_title,
            due_at: row.entry_deadline,
          });
        }
        if (row.song_limit > 0 && Boolean(row.is_setlist_accepting) && setlistDeadline >= now.getTime() && setlistDeadline <= horizon.getTime()) {
          items.push({
            kind: 'SETLIST_DEADLINE',
            event_id: row.event_id,
            event_title: row.event_title,
            due_at: row.setlist_deadline,
          });
        }
        return items;
      }),
    ].sort((a, b) => compareIsoDates(getScheduleDate(a), getScheduleDate(b))).slice(0, DASHBOARD_ITEM_LIMIT);

    const data = DashboardDataSchema.parse({
      member_actions: memberActions,
      admin_actions: adminActions,
      schedule_items: scheduleItems,
    });

    return c.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching dashboard:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

export { dashboardRoutes };
