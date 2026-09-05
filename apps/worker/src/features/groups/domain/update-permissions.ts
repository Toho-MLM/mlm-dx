export type GroupUpdateState = {
  isMain: boolean;
  isActive: boolean;
};

export type RequestedGroupUpdate = GroupUpdateState & {
  includesAssignments: boolean;
};

export function canMemberUpdateGroup(
  current: GroupUpdateState,
  requested: RequestedGroupUpdate,
): boolean {
  if (requested.isMain !== current.isMain || requested.isActive !== current.isActive) {
    return false;
  }

  return !current.isMain || !requested.includesAssignments;
}
