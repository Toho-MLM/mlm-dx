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

export type ActiveGroupAccessResult = 'ALLOWED' | 'GROUP_INACTIVE_OR_MISSING' | 'NOT_MEMBER';

export async function checkActiveGroupAccess(
  reader: GroupMembershipReader,
  userId: string,
  groupId: string,
  requireMembership: boolean,
): Promise<ActiveGroupAccessResult> {
  if (!await reader.isActiveGroup(groupId)) return 'GROUP_INACTIVE_OR_MISSING';
  if (requireMembership && !await reader.isUserInGroup(userId, groupId)) return 'NOT_MEMBER';
  return 'ALLOWED';
}
