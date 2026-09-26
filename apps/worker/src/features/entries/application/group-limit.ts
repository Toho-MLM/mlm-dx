import type { EntryRepository } from './repository';

export type GroupLimitResult = { isValid: true } | { isValid: false; error: 'EVENT_NOT_FOUND' | 'GROUP_LIMIT_EXCEEDED'; members?: string[] };

export async function validateGroupLimit(repository: EntryRepository, eventId: string, groupIds: string[]): Promise<GroupLimitResult> {
  const event = await repository.findEventState(eventId);
  if (!event) return { isValid: false, error: 'EVENT_NOT_FOUND' };
  if (event.groupLimit === 0) return { isValid: true };

  const existing = new Set(await repository.existingGroupIds(eventId));
  const newGroups = [...new Set(groupIds)].filter((groupId) => !existing.has(groupId));
  if (newGroups.length === 0) return { isValid: true };
  const exceeded = await repository.exceededMemberNames(eventId, newGroups, event.groupLimit);
  return exceeded.length
    ? { isValid: false, error: 'GROUP_LIMIT_EXCEEDED', members: exceeded }
    : { isValid: true };
}
