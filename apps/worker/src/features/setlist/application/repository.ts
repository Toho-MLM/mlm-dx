export type SetlistEventState = { songLimit: number; isAccepting: boolean };
export type SetlistItemWrite = { title: string; artist?: string };

export interface SetlistRepository {
  findEntryGroupId(entryId: string): Promise<string | null>;
  userGroupIds(userId: string): Promise<string[]>;
  findEventState(entryId: string): Promise<SetlistEventState | null>;
  createItem(input: { id: string; entryId: string; position: number; title: string; artist: string; admin: boolean; now: string }): Promise<boolean>;
  isAccepting(entryId: string): Promise<boolean | null>;
  ensureMainBandEntries(eventId: string, now: string, createId: () => string): Promise<void>;
  listEvent(eventId: string, groupIds?: string[]): Promise<Record<string, unknown>[]>;
  replace(entryId: string, note: string | null, hasSE: boolean, items: SetlistItemWrite[], now: string, createId: () => string): Promise<void>;
}

