import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ processDue: vi.fn(), resolve: vi.fn(), cookie: vi.fn() }));
vi.mock('../features/executive-transition/infrastructure/service', () => ({ createExecutiveTransitionService: () => ({ processDue: mocks.processDue }) }));
vi.mock('../features/auth/application/session', () => ({ resolveSession: mocks.resolve }));
vi.mock('../features/auth/infrastructure/d1-repository', () => ({ createD1AuthRepository: () => ({}) }));
vi.mock('./session-cookie', () => ({ getSessionCookie: mocks.cookie, hasLegacySessionCookie: () => false, clearSessionCookies: vi.fn() }));
import { requireAuth } from './auth';
import type { Bindings, Variables } from '../index';
const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();
app.get('/', requireAuth, (c) => c.json({ role: c.get('user').role }));
beforeEach(() => {
  vi.resetAllMocks();
  mocks.cookie.mockReturnValue('session-token');
  mocks.processDue.mockResolvedValue(undefined);
  mocks.resolve.mockResolvedValue({ id: 'user', name: 'test', email: 'test@example.invalid', role: 'MBR', grade: 2, instruments: '[]' });
});
describe('幹部交代と認証の順序', () => {
  it('期限到来分を反映してから最新の役職を読み、退任した幹部の権限を失効させる', async () => {
    mocks.resolve.mockImplementation(async () => {
      expect(mocks.processDue).toHaveBeenCalledTimes(1);
      return { id: 'user', name: 'test', email: 'test@example.invalid', role: 'MBR', grade: 2, instruments: '[]' };
    });
    const response = await app.request('/', {}, { DB: {} });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ role: 'MBR' });
  });
  it('交代処理が失敗したら古い役職の権限を使わせない', async () => {
    mocks.processDue.mockRejectedValue(new Error('processing failure'));
    const response = await app.request('/', {}, { DB: {} });
    expect(response.status).toBe(500);
    expect(mocks.resolve).not.toHaveBeenCalled();
  });
  it('未認証は処理せず401を返す', async () => {
    mocks.cookie.mockReturnValue(null);
    expect((await app.request('/', {}, { DB: {} })).status).toBe(401);
    expect(mocks.processDue).not.toHaveBeenCalled();
  });
});
