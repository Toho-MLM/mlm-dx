export type EventWrite = {
  id: string;
  title: string;
  eventDate: string;
  entryDeadline: string;
  isEntryAccepting: boolean;
  setlistDeadline: string;
  isSetlistAccepting: boolean;
  groupLimit: number;
  songLimit: number;
};

export interface EventRepository {
  list(): Promise<Record<string, unknown>[]>;
  findLimits(id: string): Promise<{ groupLimit: number; songLimit: number } | null>;
  hasGroupLimitViolation(id: string, groupLimit: number): Promise<boolean>;
  create(event: EventWrite, createdAt: string): Promise<void>;
  update(event: EventWrite, previous: { groupLimit: number; songLimit: number }, updatedAt: string): Promise<boolean>;
  delete(id: string): Promise<void>;
  deleteExpired(cutoff: string): Promise<void>;
}
