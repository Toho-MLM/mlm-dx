export interface EntryRepository {
  activeGroupsExist(ids: string[]): Promise<boolean>;
  userGroupIds(userId: string): Promise<string[]>;
  findEventState(eventId: string): Promise<{ groupLimit: number; isEntryAccepting: boolean } | null>;
  existingGroupIds(eventId: string): Promise<string[]>;
  exceededMemberNames(eventId: string, groupIds: string[], groupLimit: number): Promise<string[]>;
  create(eventId: string, groupIds: string[], entryIds: string[], now: string): Promise<void>;
  list(groupIds: string[], eventId?: string): Promise<Record<string, unknown>[]>;
  findGroupId(entryId: string): Promise<string | null>;
  delete(entryId: string): Promise<void>;
  updateNote(entryId: string, note: string | null): Promise<void>;
}
