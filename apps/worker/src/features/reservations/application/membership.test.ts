import { describe, expect, it, vi } from 'vitest';
import { checkActiveGroupAccess, type GroupMembershipReader } from './membership';

function reader(overrides: Partial<GroupMembershipReader> = {}): GroupMembershipReader {
  return {
    isActiveGroup: vi.fn().mockResolvedValue(true),
    isUserInGroup: vi.fn().mockResolvedValue(true),
    listGroupMemberIds: vi.fn().mockResolvedValue([]),
    getActiveGroupIdentity: vi.fn().mockResolvedValue(null),
    listIdentityMembers: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

describe('checkActiveGroupAccess', () => {
  it('非アクティブなグループを拒否し、所属行を確認しない', async () => {
    const membershipReader = reader({ isActiveGroup: vi.fn().mockResolvedValue(false) });

    await expect(checkActiveGroupAccess(membershipReader, 'user-id', 'group-id', true))
      .resolves.toBe('GROUP_INACTIVE_OR_MISSING');
    expect(membershipReader.isUserInGroup).not.toHaveBeenCalled();
  });

  it('有効グループでも非所属ユーザーを拒否する', async () => {
    const membershipReader = reader({ isUserInGroup: vi.fn().mockResolvedValue(false) });

    await expect(checkActiveGroupAccess(membershipReader, 'user-id', 'group-id', true))
      .resolves.toBe('NOT_MEMBER');
  });

  it('管理者は有効グループなら所属を要求しない', async () => {
    const membershipReader = reader({ isUserInGroup: vi.fn().mockResolvedValue(false) });

    await expect(checkActiveGroupAccess(membershipReader, 'user-id', 'group-id', false))
      .resolves.toBe('ALLOWED');
    expect(membershipReader.isUserInGroup).not.toHaveBeenCalled();
  });
});
