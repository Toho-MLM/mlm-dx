import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hallLotteryRoutes } from './routes/hall-lotteries';

const fakes = vi.hoisted(() => ({
  applications: vi.fn(),
  apply: vi.fn(),
  cancelApplication: vi.fn(),
}));

vi.mock('./middleware/auth', () => ({
  requireAuth: async (c: { req: { header: (name: string) => string | undefined }; set: (name: string, value: unknown) => void; json: (value: unknown, status: number) => Response }, next: () => Promise<void>) => {
    const role = c.req.header('x-test-role');
    if (!role) return c.json({ error: 'UNAUTHORIZED' }, 401);
    c.set('user', { id: 'test-user', role });
    return next();
  },
}));
vi.mock('./features/reservations/infrastructure/d1-hall-lottery-repository', () => ({
  createD1HallLotteryRepository: () => ({ applications: fakes.applications }),
}));
vi.mock('./utils/hall-lottery', () => ({ hallLotteryService: () => fakes }));

const lotteryId = '00000000-0000-4000-8000-000000000001';
const applicationId = '00000000-0000-4000-8000-000000000002';
const groupId = '00000000-0000-4000-8000-000000000003';
const path = `/${lotteryId}/applications`;

describe('ホール抽選の管理者モード', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakes.applications.mockResolvedValue([{ id: applicationId }]);
    fakes.apply.mockResolvedValue({ id: applicationId });
    fakes.cancelApplication.mockResolvedValue(undefined);
  });

  it.each(['', '?admin=false'])('管理者でもオフなら所属申込だけを取得する: %s', async (query) => {
    const response = await hallLotteryRoutes.request(`${path}${query}`, { headers: { 'x-test-role': 'ADM' } }, {});
    expect(response.status).toBe(200);
    expect(fakes.applications).toHaveBeenCalledWith(lotteryId, 'test-user');
  });

  it('管理者モードでは全申込を取得する', async () => {
    const response = await hallLotteryRoutes.request(`${path}?admin=true`, { headers: { 'x-test-role': 'ADM' } }, {});
    expect(response.status).toBe(200);
    expect(fakes.applications).toHaveBeenCalledWith(lotteryId, undefined);
  });

  it.each([
    [path, 'GET'],
    [path, 'POST'],
    [`${path}/${applicationId}/cancel`, 'POST'],
  ])('一般ユーザーは管理者モードを使えない: %s %s', async (endpoint, method) => {
    const response = await hallLotteryRoutes.request(`${endpoint}?admin=true`, { method, headers: { 'x-test-role': 'MBR' } }, {});
    expect(response.status).toBe(403);
    expect(fakes.applications).not.toHaveBeenCalled();
    expect(fakes.apply).not.toHaveBeenCalled();
    expect(fakes.cancelApplication).not.toHaveBeenCalled();
  });

  it.each([false, true])('申込は指定されたモードで所属を検証する: %s', async (admin) => {
    const preferences = ['2026-10-20T01:00:00.000Z'];
    const response = await hallLotteryRoutes.request(`${path}?admin=${admin}`, {
      method: 'POST',
      headers: { 'x-test-role': 'ADM', 'Content-Type': 'application/json' },
      body: JSON.stringify({ group_id: groupId, preferences }),
    }, {});
    expect(response.status).toBe(200);
    expect(fakes.apply).toHaveBeenCalledWith(lotteryId, 'test-user', groupId, preferences, admin);
  });

  it.each([false, true])('取消は指定されたモードで対象と権限を検証する: %s', async (admin) => {
    const response = await hallLotteryRoutes.request(`${path}/${applicationId}/cancel?admin=${admin}`, {
      method: 'POST', headers: { 'x-test-role': 'ADM' },
    }, {});
    expect(response.status).toBe(200);
    expect(fakes.applications).toHaveBeenCalledWith(lotteryId, admin ? undefined : 'test-user');
    expect(fakes.cancelApplication).toHaveBeenCalledWith(applicationId, 'test-user', admin);
  });

  it('未認証は拒否する', async () => {
    const response = await hallLotteryRoutes.request(path, {}, {});
    expect(response.status).toBe(401);
  });

  it('不正なモード指定は拒否する', async () => {
    const response = await hallLotteryRoutes.request(`${path}?admin=invalid`, { headers: { 'x-test-role': 'ADM' } }, {});
    expect(response.status).toBe(400);
  });
});
