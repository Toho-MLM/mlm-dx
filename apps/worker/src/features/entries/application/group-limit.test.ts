import { describe, expect, it, vi } from 'vitest';
import { validateGroupLimit } from './group-limit';
import type { EntryRepository } from './repository';

function fakeRepository(overrides: Partial<EntryRepository> = {}): EntryRepository {
  return {
    activeGroupsExist: async () => true,
    userGroupIds: async () => [],
    findEventState: async () => ({ groupLimit: 2, isEntryAccepting: true }),
    existingGroupIds: async () => [],
    exceededMemberNames: async () => [],
    create: async () => undefined,
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
      exceededMemberNames: async () => { queried = true; return []; },
    }), 'event', ['group']);
    expect(result).toEqual({ isValid: true });
    expect(queried).toBe(false);
  });

  it('追加後に上限を超えるメンバー名を返す', async () => {
    const result = await validateGroupLimit(fakeRepository({ exceededMemberNames: async () => ['テスト部員'] }), 'event', ['group']);
    expect(result).toEqual({ isValid: false, error: 'GROUP_LIMIT_EXCEEDED', members: ['テスト部員'] });
  });

  it('複数グループの対象メンバーを一度に照会する', async () => {
    const exceededMemberNames = vi.fn().mockResolvedValue([]);
    const result = await validateGroupLimit(fakeRepository({ exceededMemberNames }), 'event', ['a', 'b', 'a']);
    expect(result).toEqual({ isValid: true });
    expect(exceededMemberNames).toHaveBeenCalledOnce();
    expect(exceededMemberNames).toHaveBeenCalledWith('event', ['a', 'b'], 2);
  });
});
