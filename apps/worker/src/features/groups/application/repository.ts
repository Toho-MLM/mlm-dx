export type GroupState = { id: string; isMain: boolean; isActive: boolean };

export interface GroupRepository {
  usersExist(userIds: string[]): Promise<boolean>;
  isUserInGroup(userId: string, groupId: string): Promise<boolean>;
  getUserGroupIds(userId: string): Promise<string[]>;
  create(id: string, name: string, isMain: boolean, assignments: Record<string, string[]>, now: string, createId: () => string): Promise<void>;
  list(userId: string, mode: 'main' | 'admin' | 'member'): Promise<Record<string, unknown>[]>;
  findState(groupId: string): Promise<GroupState | null>;
  update(id: string, name: string, isMain: boolean, isActive: boolean, assignments: Record<string, string[]> | undefined, now: string, createId: () => string): Promise<void>;
  setActive(ids: string[], isActive: boolean, updatedAt: string): Promise<boolean>;
  allExist(ids: string[]): Promise<boolean>;
  delete(ids: string[]): Promise<void>;
}
