import { describe, expect, it, vi } from 'vitest';
import { setGroupsActive, type SetGroupsActiveRepository } from './set-groups-active';

function createRepository(updated = true): SetGroupsActiveRepository {
  return {
    setActive: vi.fn().mockResolvedValue(updated),
  };
}

describe('setGroupsActive', () => {
  it('重複IDを除いて有効状態を一括更新する', async () => {
    const repository = createRepository();

    const result = await setGroupsActive(
      repository,
      ['group-1', 'group-1', 'group-2'],
      false,
      '2026-09-05T00:00:00.000Z',
    );

    expect(result).toBe('UPDATED');
    expect(repository.setActive).toHaveBeenCalledWith(
      ['group-1', 'group-2'],
      false,
      '2026-09-05T00:00:00.000Z',
    );
  });

  it('repositoryが対象不足を返した場合は対象なしとして扱う', async () => {
    const repository = createRepository(false);

    const result = await setGroupsActive(repository, ['missing'], true, '2026-09-05T00:00:00.000Z');

    expect(result).toBe('GROUP_NOT_FOUND');
    expect(repository.setActive).toHaveBeenCalledWith(
      ['missing'],
      true,
      '2026-09-05T00:00:00.000Z',
    );
  });
});
