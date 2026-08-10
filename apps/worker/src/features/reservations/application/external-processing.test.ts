import { describe, expect, it, vi } from 'vitest';
import {
  createExternalReservationProcessingService,
  type ExternalReservationProcessingRepository,
} from './external-processing';

function repository(overrides: Partial<ExternalReservationProcessingRepository> = {}): ExternalReservationProcessingRepository {
  return {
    listConfirmedOverlaps: vi.fn().mockResolvedValue([]),
    listPending: vi.fn().mockResolvedValue([]),
    applyResult: vi.fn().mockResolvedValue(undefined),
    completePast: vi.fn().mockResolvedValue(0),
    deleteExpiredStudios: vi.fn().mockResolvedValue(0),
    ...overrides,
  };
}

describe('external reservation processing service', () => {
  it('部屋単位の競合を考慮して当日予約を調整する', async () => {
    const repo = repository({
      listPending: vi.fn().mockResolvedValue([{
        id: 'reservation-id', external_studio_id: 'studio-id', room_number: 1,
        user_id: 'user-id', group_id: null,
        start_time: '2026-08-10T21:00:00.000Z', end_time: '2026-08-10T23:00:00.000Z',
      }]),
      listConfirmedOverlaps: vi.fn().mockResolvedValue([{
        start_time: '2026-08-10T22:00:00.000Z', end_time: '2026-08-10T23:00:00.000Z',
      }]),
    });
    const effects = {
      broadcastReservationsChanged: vi.fn().mockResolvedValue(undefined),
      sendExternalNotification: vi.fn().mockResolvedValue(undefined),
    };
    const service = createExternalReservationProcessingService({
      repository: repo,
      effects,
      clock: { now: () => new Date('2026-08-10T15:30:00.000Z') },
    });

    await expect(service.processToday()).resolves.toBe(1);
    expect(repo.applyResult).toHaveBeenCalledWith(
      'reservation-id',
      {
        state: 'CONFIRMED',
        adjustedStartTime: '2026-08-10T21:00:00.000Z',
        adjustedEndTime: '2026-08-10T22:00:00.000Z',
      },
      '2026-08-10T15:30:00.000Z'
    );
    expect(effects.sendExternalNotification).toHaveBeenCalledWith(expect.objectContaining({
      notificationType: 'RESERVATION_ADJUSTED',
    }));
  });
});
