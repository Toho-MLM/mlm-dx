import type { ReservationState } from '@shared-schemas';

export type EntryOpportunityRow = { event_id: string; event_title: string; due_at: string; eligible_group_count: number };
export type EmptySetlistRow = { event_id: string; event_title: string; due_at: string; group_id: string; group_name: string };
export type EventDeadlineRow = { event_id: string; event_title: string; event_date?: string; entry_deadline: string; setlist_deadline: string; is_entry_accepting: boolean; is_setlist_accepting: boolean; song_limit: number };
export type TimelineIncompleteRow = { event_id: string; event_title: string; event_date: string; missing_count: number };
export type ReservationScheduleRow = { reservation_id: string; title: string; start_at: string; end_at: string; state: ReservationState };
export type DashboardWindow = { nowIso: string; horizonIso: string; todayJst: string; horizonDateJst: string; limit: number };

export interface DashboardRepository {
  entryOpportunities(userId: string, window: DashboardWindow): Promise<EntryOpportunityRow[]>;
  emptySetlists(userId: string, window: DashboardWindow): Promise<EmptySetlistRow[]>;
  reservations(kind: 'hall' | 'external', userId: string, window: DashboardWindow): Promise<ReservationScheduleRow[]>;
  deadlineEvents(window: DashboardWindow): Promise<EventDeadlineRow[]>;
  overdueEvents(window: DashboardWindow): Promise<EventDeadlineRow[]>;
  incompleteTimelines(window: DashboardWindow): Promise<TimelineIncompleteRow[]>;
}

