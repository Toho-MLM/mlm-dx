import type { TimelineUpdateItem } from '../domain/timeline';
import type { TimelineItem as SharedTimelineItem } from '@shared-schemas';

export type TimelineItem = SharedTimelineItem;

export interface TimelineRepository {
  eventExists(eventId: string): Promise<boolean>;
  ensureMainBandEntries(eventId: string, now: string, createId: () => string): Promise<void>;
  list(eventId: string): Promise<{ configured: TimelineItem[]; unconfigured: TimelineItem[] }>;
  entriesBelongToEvent(eventId: string, entryIds: string[]): Promise<boolean>;
  update(items: TimelineUpdateItem[], updatedAt: string): Promise<void>;
}
