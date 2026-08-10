import { describe, expect, it } from 'vitest';
import { validateGroupLimit } from './group-limit';
import type { EntryRepository } from './repository';

function fakeRepository(overrides: Partial<EntryRepository> = {}): EntryRepository {
  return {
    activeGroupsExist: async () => true,
    userGroupIds: async () => [],
    findEventState: async () => ({ groupLimit: 2, isEntryAccepting: true }),
    existingGroupIds: async () => [],
    groupMemberIds: async () => ['member-1'],
    memberEntryCount: async () => 0,
    memberDisplayName: async () => 'テスト部員',
    create: async () => undefined,
    hasLimitViolation: async () => false,
    deleteMany: async () => undefined,
    list: async () => [],
    findGroupId: async () => null,
    delete: async () => undefined,
    updateNote: async () => undefined,
    ...overrides,
  };
}

describe('validateGroupLimit', () => {
  it('イベントがなければ拒否する', async () => {
    const result = await validateGroupLimit(fakeRepository({ findEventState: async () => null }), 'event', ['group']);
    expect(result).toEqual({ isValid: false, error: 'EVENT_NOT_FOUND' });
  });

  it('上限0の本バンドイベントはメンバー照会なしで受け入れる', async () => {
    let queried = false;
    const result = await validateGroupLimit(fakeRepository({
      findEventState: async () => ({ groupLimit: 0, isEntryAccepting: true }),
      groupMemberIds: async () => { queried = true; return []; },
    }), 'event', ['group']);
    expect(result).toEqual({ isValid: true });
    expect(queried).toBe(false);
  });

  it('追加後に上限を超えるメンバー名を返す', async () => {
    const result = await validateGroupLimit(fakeRepository({ memberEntryCount: async () => 2 }), 'event', ['group']);
    expect(result).toEqual({ isValid: false, error: 'GROUP_LIMIT_EXCEEDED', members: ['テスト部員'] });
  });
});

