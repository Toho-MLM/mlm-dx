import { describe, expect, it, vi } from 'vitest';
import { createReservationProcessingService, type ReservationProcessingRepository } from './processing';

function createRepository(overrides: Partial<ReservationProcessingRepository> = {}): ReservationProcessingRepository {
  return {
    listConfirmedHallOverlaps: vi.fn().mockResolvedValue([]),
    listDueHallReservations: vi.fn().mockResolvedValue([]),
    applyHallProcessResult: vi.fn().mockResolvedValue('UPDATED'),
    declineHallReservation: vi.fn().mockResolvedValue(true),
    completePastHallReservations: vi.fn().mockResolvedValue(0),
    deleteHallReservationsBefore: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('reservation processing service', () => {
  it('条件付き確定が競合した場合はDECLINEDへフォールバックする', async () => {
    const repository = createRepository({
      listDueHallReservations: vi.fn().mockResolvedValue([{
        id: 'reservation-id',
        start_time: '2026-08-10T21:00:00.000Z',
        end_time: '2026-08-10T22:00:00.000Z',
        state: 'PENDING',
        updated_at: '2026-08-10T14:00:00.000Z',
      }]),
      applyHallProcessResult: vi.fn().mockResolvedValue('CONFLICT'),
    });
    const effects = {
      broadcastReservationsChanged: vi.fn().mockResolvedValue(undefined),
      sendHallNotification: vi.fn().mockResolvedValue(undefined),
    };
    const service = createReservationProcessingService({
      repository,
      effects,
      clock: { now: () => new Date('2026-08-10T15:30:00.000Z') },
    });

    await expect(service.processToday()).resolves.toBe(1);
    expect(repository.declineHallReservation).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'reservation-id' }),
      '2026-08-10T15:30:00.000Z'
    );
    expect(effects.sendHallNotification).toHaveBeenCalledWith(expect.objectContaining({
      notificationType: 'RESERVATION_DECLINED',
    }));
    expect(effects.broadcastReservationsChanged).toHaveBeenCalledOnce();
  });

  it('変更がない場合は通知とリアルタイム配信を行わない', async () => {
    const effects = {
      broadcastReservationsChanged: vi.fn().mockResolvedValue(undefined),
      sendHallNotification: vi.fn().mockResolvedValue(undefined),
    };
    const service = createReservationProcessingService({
      repository: createRepository(),
      effects,
      clock: { now: () => new Date('2026-08-10T15:30:00.000Z') },
    });

    await expect(service.processToday()).resolves.toBe(0);
    expect(effects.sendHallNotification).not.toHaveBeenCalled();
    expect(effects.broadcastReservationsChanged).not.toHaveBeenCalled();
  });

  it('処理中に取消された予約を通知しない', async () => {
    const effects = {
      broadcastReservationsChanged: vi.fn().mockResolvedValue(undefined),
      sendHallNotification: vi.fn().mockResolvedValue(undefined),
    };
    const service = createReservationProcessingService({
      repository: createRepository({
        listDueHallReservations: vi.fn().mockResolvedValue([{
          id: 'reservation-id',
          start_time: '2026-08-10T21:00:00.000Z',
          end_time: '2026-08-10T22:00:00.000Z',
          state: 'PENDING',
          updated_at: '2026-08-10T14:00:00.000Z',
        }]),
        applyHallProcessResult: vi.fn().mockResolvedValue('STALE'),
      }),
      effects,
      clock: { now: () => new Date('2026-08-10T15:30:00.000Z') },
    });

    await expect(service.processToday()).resolves.toBe(0);
    expect(effects.sendHallNotification).not.toHaveBeenCalled();
    expect(effects.broadcastReservationsChanged).not.toHaveBeenCalled();
  });

  it('一件の処理失敗後も残りを処理し、失敗を定期処理へ通知する', async () => {
    const pending = ['first', 'second'].map((id) => ({
      id,
      start_time: '2026-08-10T21:00:00.000Z',
      end_time: '2026-08-10T22:00:00.000Z',
      state: 'PENDING',
      updated_at: '2026-08-10T14:00:00.000Z',
    }));
    const effects = {
      broadcastReservationsChanged: vi.fn().mockResolvedValue(undefined),
      sendHallNotification: vi.fn().mockResolvedValue(undefined),
    };
    const applyHallProcessResult = vi.fn()
      .mockRejectedValueOnce(new Error('D1 unavailable'))
      .mockResolvedValueOnce('UPDATED');
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const service = createReservationProcessingService({
        repository: createRepository({
          listDueHallReservations: vi.fn().mockResolvedValue(pending),
          applyHallProcessResult,
        }),
        effects,
        clock: { now: () => new Date('2026-08-10T15:30:00.000Z') },
      });

      await expect(service.processToday()).rejects.toThrow('1 hall reservation(s) failed processing');
      expect(applyHallProcessResult).toHaveBeenCalledTimes(2);
      expect(effects.sendHallNotification).toHaveBeenCalledWith(expect.objectContaining({ reservationId: 'second' }));
      expect(effects.broadcastReservationsChanged).toHaveBeenCalledOnce();
    } finally {
      log.mockRestore();
    }
  });

  it('過去予約の更新件数がある場合だけ配信する', async () => {
    const effects = {
      broadcastReservationsChanged: vi.fn().mockResolvedValue(undefined),
      sendHallNotification: vi.fn().mockResolvedValue(undefined),
    };
    const service = createReservationProcessingService({
      repository: createRepository({ completePastHallReservations: vi.fn().mockResolvedValue(2) }),
      effects,
      clock: { now: () => new Date('2026-08-10T15:30:00.000Z') },
    });

    await expect(service.processPast()).resolves.toBe(2);
    expect(effects.broadcastReservationsChanged).toHaveBeenCalledOnce();
  });
});
