export interface EntryRepository {
  activeGroupsExist(ids: string[]): Promise<boolean>;
  userGroupIds(userId: string): Promise<string[]>;
  findEventState(eventId: string): Promise<{ groupLimit: number; isEntryAccepting: boolean } | null>;
  existingGroupIds(eventId: string): Promise<string[]>;
  groupMemberIds(groupId: string): Promise<string[]>;
  memberEntryCount(eventId: string, memberId: string): Promise<number>;
  memberDisplayName(memberId: string): Promise<string>;
  create(eventId: string, groupIds: string[], entryIds: string[], now: string): Promise<void>;
  hasLimitViolation(eventId: string): Promise<boolean>;
  deleteMany(ids: string[]): Promise<void>;
  list(groupIds: string[], eventId?: string): Promise<Record<string, unknown>[]>;
  findGroupId(entryId: string): Promise<string | null>;
  delete(entryId: string): Promise<void>;
  updateNote(entryId: string, note: string | null): Promise<void>;
}

