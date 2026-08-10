import { describe, expect, it } from 'vitest';
import { createInitialDraftState, groupsFromDraft } from './draft';

describe('band draft domain', () => {
  it('初期状態に3バンドと未割当メンバーを作る', () => {
    let id = 0;
    const state = createInitialDraftState(['member-1'], () => `column-${++id}`);
    expect(state.columns).toHaveLength(3);
    expect(state.unassignedMemberIds).toEqual(['member-1']);
    expect(state.version).toBe(0);
  });

  it('割当のある列だけを本バンドへ変換する', () => {
    let id = 0;
    const state = createInitialDraftState([], () => `column-${++id}`);
    state.cells['column-2'].GT = ['member-1'];
    const groups = groupsFromDraft(state, () => 'group-1');
    expect(groups).toEqual([{ id: 'group-1', name: '本バンド1', assignments: [{ instrument: 'GT', memberId: 'member-1' }] }]);
  });
});

