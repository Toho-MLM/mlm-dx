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
});
