import { describe, expect, it, vi } from 'vitest';
import type { ExecutiveTransition, SaveExecutiveTransitionRequest } from '@shared-schemas';
import { executiveTransitionService, type ExecutiveTransitionRepository } from './service';
import { executiveTransitionInstant } from '../domain/schedule';

const userId = '00000000-0000-4000-8000-000000000001';
const revision = '00000000-0000-4000-8000-000000000002';
const request: SaveExecutiveTransitionRequest = {
  effective_date: '2026-11-01', assignments: [{ user_id: userId, role: 'MGR' }], expected_revision: null,
};
const schedule: ExecutiveTransition = {
  revision, effective_date: request.effective_date, effective_at: '2026-10-31T15:00:00.000Z',
  assignments: request.assignments, status: 'PENDING', failure_reason: null,
};
function setup(now: string, overrides: Partial<ExecutiveTransitionRepository> = {}) {
  const repository: ExecutiveTransitionRepository = {
    get: vi.fn().mockResolvedValue(schedule), eligibleMemberIds: vi.fn().mockResolvedValue(new Set([userId])),
    save: vi.fn().mockResolvedValue(true), cancel: vi.fn().mockResolvedValue(true), applyDue: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return { repository, service: executiveTransitionService(repository, () => new Date(now), () => revision) };
}
describe('幹部交代 application', () => {
  it('JSTの交代日0時を前日の15時UTCとして一括保存する', async () => {
    const { service, repository } = setup('2026-10-30T15:00:00.000Z');
    expect(executiveTransitionInstant('2027-01-01')).toBe('2026-12-31T15:00:00.000Z');
    expect(await service.save(request)).toEqual(schedule);
    expect(repository.save).toHaveBeenCalledWith(schedule, null, '2026-10-30T15:00:00.000Z');
  });
  it.each(['2026-10-31T15:00:00.000Z', '2026-10-31T15:00:00.001Z'])('指定日の0時以降には同日の予約を拒否する: %s', async (now) => {
    const { service, repository } = setup(now);
    await expect(service.save(request)).rejects.toMatchObject({ code: 'INVALID_EFFECTIVE_DATE' });
    expect(repository.save).not.toHaveBeenCalled();
  });
  it.each(['2026-10-31T14:59:59.999Z', '2026-10-31T15:00:00.000Z', '2026-10-31T15:00:00.001Z'])('0時直前・一致・直後と遅延実行を判定する: %s', async (now) => {
    const { service, repository } = setup(now);
    await service.processDue();
    expect(repository.applyDue).toHaveBeenCalledTimes(now < schedule.effective_at ? 0 : 1);
  });
  it('削除済みメンバーや管理者を対象にした設定を保存しない', async () => {
    const { service, repository } = setup('2026-10-30T15:00:00.000Z', { eligibleMemberIds: vi.fn().mockResolvedValue(new Set()) });
    await expect(service.save(request)).rejects.toMatchObject({ code: 'MEMBER_UNAVAILABLE' });
    expect(repository.save).not.toHaveBeenCalled();
  });
  it('同時変更や取消・実行との競合を返す', async () => {
    const { service } = setup('2026-10-30T15:00:00.000Z', { save: vi.fn().mockResolvedValue(false), cancel: vi.fn().mockResolvedValue(false) });
    await expect(service.save(request)).rejects.toMatchObject({ code: 'TRANSITION_CONFLICT' });
    await expect(service.cancel(revision)).rejects.toMatchObject({ code: 'TRANSITION_CONFLICT' });
  });
  it.each(['APPLIED', 'CANCELLED', 'FAILED'] as const)('処理済みの予定は再実行しない: %s', async (status) => {
    const { service, repository } = setup('2026-11-01T00:00:00.000Z', { get: vi.fn().mockResolvedValue({ ...schedule, status }) });
    await service.processDue();
    expect(repository.applyDue).not.toHaveBeenCalled();
  });
});
