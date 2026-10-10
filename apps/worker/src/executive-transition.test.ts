import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Context, Next } from 'hono';
const mocks = vi.hoisted(() => ({ get: vi.fn(), save: vi.fn(), cancel: vi.fn() }));
vi.mock('./middleware/auth', () => ({
  requireAuth: async (c: Context, next: Next) => {
    const role = c.req.header('X-Test-Role');
    if (!role) return c.json({ success: false, error: 'UNAUTHORIZED' }, 401);
    c.set('user', { id: 'test-user', role });
    return next();
  },
}));
vi.mock('./features/executive-transition/infrastructure/service', () => ({ createExecutiveTransitionService: () => mocks }));
import { executiveTransitionRoutes } from './routes/executive-transition';
import { ExecutiveTransitionError } from './features/executive-transition/application/service';
const id = '00000000-0000-4000-8000-000000000001';
const payload = { effective_date: '2027-01-01', assignments: [{ user_id: id, role: 'MGR' }], expected_revision: null };
function request(method: string, role?: string, body?: unknown) {
  return executiveTransitionRoutes.request('/', {
    method, headers: { 'Content-Type': 'application/json', ...(role ? { 'X-Test-Role': role } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }, { DB: {} });
}
beforeEach(() => { vi.resetAllMocks(); mocks.get.mockResolvedValue(null); mocks.save.mockResolvedValue({ revision: id }); });
describe('幹部交代 HTTP境界', () => {
  it.each(['GET', 'PUT', 'DELETE'])('未認証は401、部員は403: %s', async (method) => {
    expect((await request(method, undefined, method === 'GET' ? undefined : payload)).status).toBe(401);
    expect((await request(method, 'MBR', method === 'GET' ? undefined : payload)).status).toBe(403);
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.cancel).not.toHaveBeenCalled();
    expect(mocks.get).not.toHaveBeenCalled();
  });
  it.each(['ADM', 'MGR', 'CHF', 'MAC', 'NHD', 'NAC'])('isAdminに従いMBR以外の取得・設定・取消を許可する: %s', async (role) => {
    expect((await request('GET', role)).status).toBe(200);
    expect((await request('PUT', role, payload)).status).toBe(200);
    expect(mocks.save).toHaveBeenCalledWith(payload);
    expect((await request('DELETE', role, { expected_revision: id })).status).toBe(200);
    expect(mocks.get).toHaveBeenCalledTimes(1);
    expect(mocks.cancel).toHaveBeenCalledWith(id);
  });
  it.each([
    { ...payload, effective_date: '2027-02-30' },
    { ...payload, effective_date: '2027-01-01T00:00:00Z' },
    { ...payload, assignments: [] },
    { ...payload, assignments: [{ user_id: id, role: 'ADM' }] },
    { ...payload, assignments: [{ user_id: 'bad', role: 'MGR' }] },
    { ...payload, assignments: [payload.assignments[0], payload.assignments[0]] },
    { ...payload, expected_revision: 'bad' },
  ])('不正日付・管理者への変更・重複などを400にする', async (body) => {
    expect((await request('PUT', 'ADM', body)).status).toBe(400);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it('競合は409、未来日ではない場合は400を返す', async () => {
    mocks.save.mockRejectedValue(new ExecutiveTransitionError('TRANSITION_CONFLICT'));
    expect((await request('PUT', 'ADM', payload)).status).toBe(409);
    mocks.save.mockRejectedValue(new ExecutiveTransitionError('INVALID_EFFECTIVE_DATE'));
    expect((await request('PUT', 'ADM', payload)).status).toBe(400);
    expect((await request('DELETE', 'ADM', {})).status).toBe(400);
  });
});
