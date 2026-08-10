import type { TimelineUpdateItem } from '../domain/timeline';

export type TimelineItem = {
  entry_id: string;
  group_id: string;
  group_name: string;
  start_time: string | null;
  end_time: string | null;
  position: number | null;
};

export interface TimelineRepository {
  eventExists(eventId: string): Promise<boolean>;
  ensureMainBandEntries(eventId: string, now: string, createId: () => string): Promise<void>;
  list(eventId: string): Promise<{ configured: TimelineItem[]; unconfigured: TimelineItem[] }>;
  entriesBelongToEvent(eventId: string, entryIds: string[]): Promise<boolean>;
  update(items: TimelineUpdateItem[], updatedAt: string): Promise<void>;
}

