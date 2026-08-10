import { DashboardDataSchema, type DashboardAdminAction, type DashboardMemberAction, type DashboardScheduleItem } from '@shared-schemas';
import type { DashboardRepository, DashboardWindow, EventDeadlineRow } from './repository';

const HORIZON_DAYS = 14;
const ITEM_LIMIT = 5;
const JST_OFFSET = 9 * 60 * 60 * 1000;
const compare = (a: string, b: string) => new Date(a).getTime() - new Date(b).getTime();
const jstDate = (date: Date) => new Date(date.getTime() + JST_OFFSET).toISOString().slice(0, 10);
const scheduleDate = (item: DashboardScheduleItem) =>
  item.kind === 'HALL_RESERVATION' || item.kind === 'EXTERNAL_RESERVATION' ? item.start_at : item.due_at;

function deadlineItems(row: EventDeadlineRow, now: Date, horizon: Date): DashboardScheduleItem[] {
  const items: DashboardScheduleItem[] = [];
  const entryTime = new Date(row.entry_deadline).getTime();
  const setlistTime = new Date(row.setlist_deadline).getTime();
  if (row.is_entry_accepting && entryTime >= now.getTime() && entryTime <= horizon.getTime()) {
    items.push({ kind: 'ENTRY_DEADLINE', event_id: row.event_id, event_title: row.event_title, due_at: row.entry_deadline });
  }
  if (row.song_limit > 0 && row.is_setlist_accepting && setlistTime >= now.getTime() && setlistTime <= horizon.getTime()) {
    items.push({ kind: 'SETLIST_DEADLINE', event_id: row.event_id, event_title: row.event_title, due_at: row.setlist_deadline });
  }
  return items;
}

export async function getDashboard(repository: DashboardRepository, userId: string, admin: boolean, now = new Date()) {
  const horizon = new Date(now.getTime() + HORIZON_DAYS * 86_400_000);
  const window: DashboardWindow = {
    nowIso: now.toISOString(), horizonIso: horizon.toISOString(), todayJst: jstDate(now),
    horizonDateJst: jstDate(horizon), limit: ITEM_LIMIT,
  };
  const [opportunities, setlists, hall, external, deadlines] = await Promise.all([
    repository.entryOpportunities(userId, window), repository.emptySetlists(userId, window),
    repository.reservations('hall', userId, window), repository.reservations('external', userId, window),
    repository.deadlineEvents(window),
  ]);
  const memberActions: DashboardMemberAction[] = [
    ...opportunities.map((row) => ({ kind: 'ENTRY_AVAILABLE' as const, ...row, eligible_group_count: Number(row.eligible_group_count) })),
    ...setlists.map((row) => ({ kind: 'SETLIST_EMPTY' as const, ...row })),
  ].sort((a, b) => compare(a.due_at, b.due_at)).slice(0, ITEM_LIMIT);

  let adminActions: DashboardAdminAction[] = [];
  if (admin) {
    const [overdue, incomplete] = await Promise.all([repository.overdueEvents(window), repository.incompleteTimelines(window)]);
    adminActions = [
      ...overdue.flatMap((row): DashboardAdminAction[] => [
        ...(row.is_entry_accepting && new Date(row.entry_deadline) < now
          ? [{ kind: 'ENTRY_ACCEPTING_AFTER_DEADLINE' as const, event_id: row.event_id, event_title: row.event_title, due_at: row.entry_deadline }] : []),
        ...(row.song_limit > 0 && row.is_setlist_accepting && new Date(row.setlist_deadline) < now
          ? [{ kind: 'SETLIST_ACCEPTING_AFTER_DEADLINE' as const, event_id: row.event_id, event_title: row.event_title, due_at: row.setlist_deadline }] : []),
      ]),
      ...incomplete.map((row) => ({ kind: 'TIMELINE_INCOMPLETE' as const, ...row, missing_count: Number(row.missing_count) })),
    ].sort((a, b) => compare(a.kind === 'TIMELINE_INCOMPLETE' ? a.event_date : a.due_at,
      b.kind === 'TIMELINE_INCOMPLETE' ? b.event_date : b.due_at)).slice(0, ITEM_LIMIT);
  }
  const scheduleItems: DashboardScheduleItem[] = [
    ...hall.map((row) => ({ kind: 'HALL_RESERVATION' as const, ...row })),
    ...external.map((row) => ({ kind: 'EXTERNAL_RESERVATION' as const, ...row })),
    ...deadlines.flatMap((row) => deadlineItems(row, now, horizon)),
  ].sort((a, b) => compare(scheduleDate(a), scheduleDate(b))).slice(0, ITEM_LIMIT);
  return DashboardDataSchema.parse({ member_actions: memberActions, admin_actions: adminActions, schedule_items: scheduleItems });
}
