import type { GroupRepository } from './repository';

export type ReorderMainGroupsResult = 'SUCCESS' | 'GROUP_ORDER_MISMATCH';

export async function reorderMainGroups(
  repository: GroupRepository,
  orderedIds: string[],
  updatedAt: string,
): Promise<ReorderMainGroupsResult> {
  const currentIds = await repository.listActiveMainGroupIds();
  if (
    orderedIds.length !== currentIds.length
    || new Set(orderedIds).size !== orderedIds.length
    || orderedIds.some((id) => !currentIds.includes(id))
  ) {
    return 'GROUP_ORDER_MISMATCH';
  }

  await repository.reorderMainGroups(orderedIds, updatedAt);
  return 'SUCCESS';
}
