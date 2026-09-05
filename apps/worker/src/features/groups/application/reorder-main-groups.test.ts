import { describe, expect, it, vi } from 'vitest';
import type { GroupRepository } from './repository';
import { reorderMainGroups } from './reorder-main-groups';

function createRepository(activeIds: string[]): GroupRepository {
  return {
    listActiveMainGroupIds: vi.fn().mockResolvedValue(activeIds),
    reorderMainGroups: vi.fn().mockResolvedValue(undefined),
  } as unknown as GroupRepository;
}

describe('reorderMainGroups', () => {
  it('有効な本バンドを指定順に更新する', async () => {
    const repository = createRepository(['group-1', 'group-2']);

    await expect(reorderMainGroups(
      repository,
      ['group-2', 'group-1'],
      '2026-09-05T00:00:00.000Z',
    )).resolves.toBe('SUCCESS');
    expect(repository.reorderMainGroups).toHaveBeenCalledWith(
      ['group-2', 'group-1'],
      '2026-09-05T00:00:00.000Z',
    );
  });

  it.each([
    [['group-1']],
    [['group-1', 'group-3']],
    [['group-1', 'group-1']],
  ])('不足・対象外・重複を含む順序を拒否する: %j', async (orderedIds) => {
    const repository = createRepository(['group-1', 'group-2']);

    await expect(reorderMainGroups(repository, orderedIds, 'now'))
      .resolves.toBe('GROUP_ORDER_MISMATCH');
    expect(repository.reorderMainGroups).not.toHaveBeenCalled();
  });
});
