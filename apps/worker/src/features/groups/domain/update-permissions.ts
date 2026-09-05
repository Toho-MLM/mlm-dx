export type GroupUpdateState = {
  mainIndex: number | null;
  isActive: boolean;
};

export type RequestedGroupUpdate = GroupUpdateState & {
  includesAssignments: boolean;
};

export function canMemberUpdateGroup(
  current: GroupUpdateState,
  requested: RequestedGroupUpdate,
): boolean {
  if (requested.mainIndex !== current.mainIndex || requested.isActive !== current.isActive) {
    return false;
  }

  return current.mainIndex === null || !requested.includesAssignments;
}
