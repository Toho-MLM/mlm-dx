import type { EntryRepository } from './repository';

export type GroupLimitResult = { isValid: true } | { isValid: false; error: 'EVENT_NOT_FOUND' | 'GROUP_LIMIT_EXCEEDED'; members?: string[] };

export async function validateGroupLimit(repository: EntryRepository, eventId: string, groupIds: string[]): Promise<GroupLimitResult> {
  const event = await repository.findEventState(eventId);
  if (!event) return { isValid: false, error: 'EVENT_NOT_FOUND' };
  if (event.groupLimit === 0) return { isValid: true };

  const existing = new Set(await repository.existingGroupIds(eventId));
  const newGroups = [...new Set(groupIds)].filter((groupId) => !existing.has(groupId));
  const additions = new Map<string, number>();
  for (const groupId of newGroups) {
    for (const memberId of await repository.groupMemberIds(groupId)) {
      additions.set(memberId, (additions.get(memberId) ?? 0) + 1);
    }
  }

  const exceeded: string[] = [];
  for (const [memberId, count] of additions) {
    if (await repository.memberEntryCount(eventId, memberId) + count > event.groupLimit) {
      exceeded.push(await repository.memberDisplayName(memberId));
    }
  }
  return exceeded.length
    ? { isValid: false, error: 'GROUP_LIMIT_EXCEEDED', members: exceeded }
    : { isValid: true };
}

