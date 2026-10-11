import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Context, Next } from 'hono';
import { isAdmin, isAdm, requireAdm } from '@shared-schemas';

const fakes = vi.hoisted(() => ({
  hall: { existsReservation: vi.fn(), deleteReservation: vi.fn(), findReservation: vi.fn(), updateState: vi.fn() },
  external: {
    existsReservation: vi.fn(), deleteReservation: vi.fn(), findReservation: vi.fn(), updateState: vi.fn(),
    findStudio: vi.fn(), closeLotteryApplications: vi.fn(), listRevocableReservationIds: vi.fn(), deleteStudioCascade: vi.fn(),
  },
  broadcast: vi.fn(),
  email: vi.fn(),
}));
vi.mock('./middleware/auth', () => ({
  requireAuth: async (c: Context, next: Next) => {
    const role = c.req.header('X-Test-Role');
    if (!role) return c.json({ success: false, error: 'UNAUTHORIZED' }, 401);
    c.set('user', { id: 'actor', role });
    return next();
  },
}));
vi.mock('./features/reservations/infrastructure/d1-hall-repository', () => ({
  createD1HallReservationRepository: () => fakes.hall,
}));
vi.mock('./features/reservations/infrastructure/d1-external-repository', () => ({
  createD1ExternalReservationRepository: () => fakes.external,
}));
vi.mock('./utils/reservation-realtime', () => ({ broadcastReservationRealtimeEvent: fakes.broadcast }));
vi.mock('./utils/reservation-email', () => ({ prepareAndSendReservationEmail: fakes.email }));

import { reservationRoutes } from './routes/reservations';
import { externalReservationRoutes, externalStudioRoutes } from './routes/external';

const id = '00000000-0000-4000-8000-000000000001';
const roles = ['MGR', 'CHF', 'MAC', 'NHD', 'NAC', 'MBR', 'UNKNOWN'];
const cases = [
  { name: 'ホール予約', routes: reservationRoutes, repository: fakes.hall },
  { name: '外部予約', routes: externalReservationRoutes, repository: fakes.external },
];
const executionCtx = { waitUntil: vi.fn(), passThroughOnException: vi.fn(), props: {} };

beforeEach(() => {
  vi.resetAllMocks();
  for (const { repository } of cases) {
    repository.existsReservation.mockResolvedValue(true);
    repository.findReservation.mockResolvedValue({ user_id: 'other', group_id: null, state: 'CONFIRMED' });
  }
  fakes.external.findStudio.mockResolvedValue({ id, target_type: 'EXTERNAL', room_names: '["部屋"]' });
  fakes.external.listRevocableReservationIds.mockResolvedValue([]);
});

describe('抽選対象削除による予約の連動削除', () => {
  it.each(['MGR', 'CHF', 'MAC', 'NHD', 'NAC'])('Editorも抽選対象の連動削除を実行できる: %s', async (role) => {
    const response = await externalStudioRoutes.request(`/studios/${id}`, {
      method: 'DELETE', headers: { 'X-Test-Role': role },
    }, { DB: {} }, executionCtx);
    expect(response.status).toBe(200);
    expect(fakes.external.deleteStudioCascade).toHaveBeenCalledExactlyOnceWith(id, 'EXTERNAL', expect.any(String));
    expect(fakes.broadcast).toHaveBeenCalledOnce();
  });

  it('MBRは抽選対象を削除できない', async () => {
    const response = await externalStudioRoutes.request(`/studios/${id}`, {
      method: 'DELETE', headers: { 'X-Test-Role': 'MBR' },
    }, { DB: {} }, executionCtx);
    expect(response.status).toBe(403);
    expect(fakes.external.deleteStudioCascade).not.toHaveBeenCalled();
  });
});

describe('ADM専用の権限判定', () => {
  it('Editor権限も有効な役職だけを許可する', () => {
    for (const role of ['ADM', 'MGR', 'CHF', 'MAC', 'NHD', 'NAC']) expect(isAdmin(role)).toBe(true);
    for (const role of ['MBR', 'UNKNOWN', 'adm', '', undefined]) expect(isAdmin(role)).toBe(false);
  });
  it('ADMのみ許可し、Editor・MBR・未定義の役職を拒否する', () => {
    expect(isAdm('ADM')).toBe(true);
    expect(() => requireAdm('ADM')).not.toThrow();
    for (const role of [...roles, undefined, '', 'adm']) {
      expect(isAdm(role)).toBe(false);
      expect(() => requireAdm(role)).toThrow('INSUFFICIENT_PERMISSIONS');
    }
  });
});

describe.each(cases)('$nameの完全削除', ({ routes, repository }) => {
  const remove = (role?: string, target = id, query = '') => routes.request(`/${target}${query}`, {
    method: 'DELETE', headers: role ? { 'X-Test-Role': role } : {},
  }, { DB: {} }, executionCtx);

  it.each(roles)('ADM以外はDB参照・削除・通知を行わず403: %s', async (role) => {
    const response = await remove(role, id, '?admin=true');
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ success: false, error: 'INSUFFICIENT_PERMISSIONS' });
    expect(repository.existsReservation).not.toHaveBeenCalled();
    expect(repository.deleteReservation).not.toHaveBeenCalled();
    expect(fakes.broadcast).not.toHaveBeenCalled();
  });

  it('未認証は401、DB操作なし', async () => {
    expect((await remove()).status).toBe(401);
    expect(repository.existsReservation).not.toHaveBeenCalled();
    expect(repository.deleteReservation).not.toHaveBeenCalled();
  });

  it('ADMなら予約を削除しリアルタイム更新を送る', async () => {
    const response = await remove('ADM');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(repository.deleteReservation).toHaveBeenCalledExactlyOnceWith(id);
    expect(fakes.broadcast).toHaveBeenCalledExactlyOnceWith({ DB: {} }, 'reservations_changed');
  });

  it('不正IDは400、対象なしは404で削除しない', async () => {
    expect((await remove('ADM', 'invalid')).status).toBe(400);
    expect(repository.existsReservation).not.toHaveBeenCalled();
    repository.existsReservation.mockResolvedValue(false);
    const response = await remove('ADM');
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ success: false, error: 'RESERVATION_NOT_FOUND' });
    expect(repository.deleteReservation).not.toHaveBeenCalled();
    expect(fakes.broadcast).not.toHaveBeenCalled();
  });

  it.each(['MGR', 'CHF', 'MAC', 'NHD', 'NAC'])('Editorによる予約取消は引き続き可能: %s', async (role) => {
    const response = await routes.request(`/${id}/cancel?admin=true`, {
      method: 'POST', headers: { 'X-Test-Role': role },
    }, { DB: {} }, executionCtx);
    expect(response.status).toBe(200);
    expect(repository.updateState).toHaveBeenCalledWith(id, 'DECLINED', expect.any(String));
    expect(repository.deleteReservation).not.toHaveBeenCalled();
  });
});
