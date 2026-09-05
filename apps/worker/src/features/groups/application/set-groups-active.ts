export interface SetGroupsActiveRepository {
  setActive(ids: string[], isActive: boolean, updatedAt: string): Promise<boolean>;
}

export async function setGroupsActive(
  repository: SetGroupsActiveRepository,
  ids: string[],
  isActive: boolean,
  updatedAt: string,
): Promise<'UPDATED' | 'GROUP_NOT_FOUND'> {
  const uniqueIds = [...new Set(ids)];
  return await repository.setActive(uniqueIds, isActive, updatedAt)
    ? 'UPDATED'
    : 'GROUP_NOT_FOUND';
}
