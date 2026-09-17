import { describe, expect, it, vi } from 'vitest';
import type { Context, Next } from 'hono';
const mocks = vi.hoisted(() => ({
  create: vi.fn(async () => ({})),
  apply: vi.fn(async () => ({ id: 'new' })),
  cancel: vi.fn(async () => {}),
  list: vi.fn(async () => []),
  applications: vi.fn(async () => []),
}));
vi.mock('./middleware/auth', () => ({
  requireAuth: async (c: Context, next: Next) => {
    const role = c.req.header('X-Test-Role');
    if (!role) return c.json({ success: false, error: 'UNAUTHORIZED' }, 401);
    c.set('user', { id: '00000000-0000-4000-8000-000000000002', role });
    return next();
  },
}));
vi.mock('./utils/hall-lottery', () => ({ hallLotteryService: () => mocks }));
vi.mock(
  './features/reservations/infrastructure/d1-hall-lottery-repository',
  () => ({ createD1HallLotteryRepository: () => mocks }),
);
import { hallLotteryRoutes } from './routes/hall-lotteries';
const id = '00000000-0000-4000-8000-000000000001';
const request = (path: string, role?: string, body?: unknown) =>
  hallLotteryRoutes.request(
    path,
    {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        ...(role ? { 'X-Test-Role': role } : {}),
        'Content-Type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
    { DB: {} },
  );
describe('ホール抽選 HTTP 境界', () => {
  it('未認証は401、一般ユーザーの管理操作は403', async () => {
    expect((await request('/')).status).toBe(401);
    expect((await request('/', 'MBR', {})).status).toBe(403);
    expect((await request(`/${id}/cancel`, 'MBR', {})).status).toBe(403);
  });
  it('不正な募集・希望・パラメータは400', async () => {
    expect(
      (
        await request('/', 'ADM', {
          name: '募集',
          start_date: '2026-10-01',
          end_date: '2026-09-01',
          deadline_date: '2026-09-25',
          duration_minutes: 120,
          target_band_type: 'FREE',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(`/${id}/applications`, 'MBR', {
          group_id: id,
          preferences: [],
        })
      ).status,
    ).toBe(400);
    expect((await request('/bad-id/applications', 'MBR')).status).toBe(400);
  });
  it('管理者の募集作成、一般ユーザーの申込をアプリケーションへ渡す', async () => {
    expect(
      (
        await request('/', 'ADM', {
          name: '募集',
          start_date: '2026-10-01',
          end_date: '2026-10-03',
          deadline_date: '2026-09-25',
          duration_minutes: 120,
          target_band_type: 'FREE',
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(`/${id}/applications`, 'MBR', {
          group_id: id,
          preferences: ['2026-10-01T10:00:00+09:00'],
        })
      ).status,
    ).toBe(200);
    expect(mocks.apply).toHaveBeenCalledWith(
      id,
      '00000000-0000-4000-8000-000000000002',
      id,
      ['2026-10-01T01:00:00.000Z'],
      false,
    );
  });
  it('一般ユーザーの取得は所属・本人の申込に限定する', async () => {
    await request(`/${id}/applications`, 'MBR');
    expect(mocks.applications).toHaveBeenLastCalledWith(
      id,
      '00000000-0000-4000-8000-000000000002',
    );
    await request(`/${id}/applications`, 'ADM');
    expect(mocks.applications).toHaveBeenLastCalledWith(id, undefined);
  });
  it('代理申込権限はリクエスト本文ではなく認証ユーザーのロールで決定する', async () => {
    const body = {
      group_id: id,
      preferences: ['2026-10-01T10:00:00+09:00'],
      admin: true,
    };
    await request(`/${id}/applications`, 'MBR', body);
    expect(mocks.apply).toHaveBeenLastCalledWith(
      id,
      '00000000-0000-4000-8000-000000000002',
      id,
      ['2026-10-01T01:00:00.000Z'],
      false,
    );
    await request(`/${id}/applications`, 'ADM', body);
    expect(mocks.apply).toHaveBeenLastCalledWith(
      id,
      '00000000-0000-4000-8000-000000000002',
      id,
      ['2026-10-01T01:00:00.000Z'],
      true,
    );
  });

  it('募集の対象区分は本バンド・自由バンドのいずれかの明示指定を必須にする', async () => {
    const body = {
      name: '募集',
      start_date: '2026-10-01',
      end_date: '2026-10-03',
      deadline_date: '2026-09-25',
      duration_minutes: 120,
    };
    expect((await request('/', 'ADM', body)).status).toBe(400);
    expect(
      (await request('/', 'ADM', { ...body, target_band_type: 'ALL' })).status,
    ).toBe(400);
    for (const target_band_type of ['MAIN', 'FREE']) {
      expect(
        (await request('/', 'ADM', { ...body, target_band_type })).status,
      ).toBe(200);
      expect(mocks.create).toHaveBeenLastCalledWith({
        ...body,
        target_band_type,
      });
    }
  });
});
