import { describe, expect, it, vi } from 'vitest';
import { createReservationLimitService, type ReservationLimitRepository } from './limits';

function repository(overrides: Partial<ReservationLimitRepository> = {}): ReservationLimitRepository {
  return {
    listLimits: vi.fn().mockResolvedValue([]),
    listUsageIntervals: vi.fn().mockResolvedValue([]),
    hasOverlappingFixedLimit: vi.fn().mockResolvedValue(false),
    hasRollingLimit: vi.fn().mockResolvedValue(false),
    existsLimit: vi.fn().mockResolvedValue(false),
    createLimit: vi.fn().mockResolvedValue(undefined),
    updateLimit: vi.fn().mockResolvedValue(undefined),
    deleteLimit: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('reservation limit service', () => {
  it('ホール・外部・抽選の利用時間と新規予約を合算する', async () => {
    const service = createReservationLimitService(repository({
      listLimits: vi.fn().mockResolvedValue([{
        id: 'limit-id',
        scope: 'PERSONAL',
        limit_type: 'FIXED',
        start_datetime: '2026-08-11T00:00:00.000Z',
        end_datetime: '2026-08-11T04:00:00.000Z',
        window_days: null,
        max_minutes: 120,
      }]),
      listUsageIntervals: vi.fn().mockResolvedValue([
        { start_time: '2026-08-11T00:00:00.000Z', end_time: '2026-08-11T00:45:00.000Z' },
        { start_time: '2026-08-11T01:00:00.000Z', end_time: '2026-08-11T01:30:00.000Z' },
      ]),
    }));

    await expect(service.hasConflict({
      userId: 'user-id',
      groupId: null,
      startTime: '2026-08-11T02:00:00.000Z',
      endTime: '2026-08-11T03:00:00.000Z',
    })).resolves.toBe(true);
  });

  it('固定上限の対象期間外なら利用量を問い合わせない', async () => {
    const repo = repository({
      listLimits: vi.fn().mockResolvedValue([{
        id: 'limit-id',
        scope: 'PERSONAL',
        limit_type: 'FIXED',
        start_datetime: '2026-08-12T00:00:00.000Z',
        end_datetime: '2026-08-12T04:00:00.000Z',
        window_days: null,
        max_minutes: 60,
      }]),
    });
    const service = createReservationLimitService(repo);

    await expect(service.hasConflict({
      userId: 'user-id',
      groupId: null,
      startTime: '2026-08-11T00:00:00.000Z',
      endTime: '2026-08-11T01:00:00.000Z',
    })).resolves.toBe(false);
    expect(repo.listUsageIntervals).not.toHaveBeenCalled();
  });
});
