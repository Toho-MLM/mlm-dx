import { describe, expect, it } from 'vitest';
import { canMemberUpdateGroup } from './update-permissions';

describe('canMemberUpdateGroup', () => {
  it('本バンドは名称だけの更新を許可する', () => {
    expect(canMemberUpdateGroup(
      { mainIndex: 2, isActive: true },
      { mainIndex: 2, isActive: true, includesAssignments: false },
    )).toBe(true);
  });

  it('本バンドのメンバー・種類・有効状態の変更を拒否する', () => {
    const current = { mainIndex: 2, isActive: true };

    expect(canMemberUpdateGroup(current, {
      mainIndex: 2,
      isActive: true,
      includesAssignments: true,
    })).toBe(false);
    expect(canMemberUpdateGroup(current, {
      mainIndex: null,
      isActive: true,
      includesAssignments: false,
    })).toBe(false);
    expect(canMemberUpdateGroup(current, {
      mainIndex: 1,
      isActive: true,
      includesAssignments: false,
    })).toBe(false);
    expect(canMemberUpdateGroup(current, {
      mainIndex: 2,
      isActive: false,
      includesAssignments: false,
    })).toBe(false);
  });

  it('自由バンドは種類と有効状態を維持する場合にメンバー更新を許可する', () => {
    expect(canMemberUpdateGroup(
      { mainIndex: null, isActive: true },
      { mainIndex: null, isActive: true, includesAssignments: true },
    )).toBe(true);
  });
});
