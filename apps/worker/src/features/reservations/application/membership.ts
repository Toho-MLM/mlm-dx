export type ActiveGroupIdentity = {
  isMain: boolean;
  memberIds: string[];
};

export type IdentityMember = { id: string; name: string };

export interface GroupMembershipReader {
  isActiveGroup(groupId: string): Promise<boolean>;
  isUserInGroup(userId: string, groupId: string): Promise<boolean>;
  listGroupMemberIds(groupId: string): Promise<string[]>;
  getActiveGroupIdentity(groupId: string): Promise<ActiveGroupIdentity | null>;
  listIdentityMembers(userId: string, groupId: string | null): Promise<IdentityMember[]>;
}
