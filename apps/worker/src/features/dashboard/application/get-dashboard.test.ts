import { describe, expect, it } from 'vitest';
import { getDashboard } from './get-dashboard';
import type { DashboardRepository } from './repository';

const repository: DashboardRepository = {
  entryOpportunities: async () => [{ event_id: '00000000-0000-4000-8000-000000000001', event_title: 'ライブ', due_at: '2026-01-02T00:00:00.000Z', eligible_group_count: 1 }],
  emptySetlists: async () => [],
  reservations: async (kind) => kind === 'hall' ? [{
    reservation_id: '00000000-0000-4000-8000-000000000002', title: 'バンド', start_at: '2026-01-01T03:00:00.000Z',
    end_at: '2026-01-01T04:00:00.000Z', state: 'CONFIRMED',
  }] : [],
  deadlineEvents: async () => [],
  overdueEvents: async () => [],
  incompleteTimelines: async () => [],
};

describe('getDashboard', () => {
  it('一般ユーザー向けアクションと予定を集約する', async () => {
    const result = await getDashboard(repository, 'user-1', false, new Date('2026-01-01T00:00:00.000Z'));
    expect(result.member_actions[0].kind).toBe('ENTRY_AVAILABLE');
    expect(result.admin_actions).toEqual([]);
    expect(result.schedule_items[0].kind).toBe('HALL_RESERVATION');
  });

  it('セトリのバンド順を締切順で上書きせず、エントリー案内を混ぜても5件の上限を保つ', async () => {
    const bandIds = [3, 4, 5, 6, 7].map((value) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`);
    const result = await getDashboard({
      ...repository,
      emptySetlists: async () => bandIds.map((group_id, index) => ({
        event_id: '00000000-0000-4000-8000-000000000001', event_title: 'ライブ',
        group_id, group_name: `バンド${index + 1}`,
        due_at: index === 0 ? '2026-01-04T00:00:00.000Z' : '2026-01-03T00:00:00.000Z',
      })),
    }, 'user-1', false, new Date('2026-01-01T00:00:00.000Z'));
    expect(result.member_actions).toHaveLength(5);
    expect(result.member_actions[0].kind).toBe('ENTRY_AVAILABLE');
    expect(result.member_actions.filter((item) => item.kind === 'SETLIST_EMPTY').map((item) => item.group_id))
      .toEqual(bandIds.slice(0, 4));
  });
});
