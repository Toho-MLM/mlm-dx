import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Context, Next } from 'hono';
import { setlistRoutes } from './routes/setlist';

const entryId = '00000000-0000-4000-8000-000000000001';
const groupId = '00000000-0000-4000-8000-000000000002';
const repository = vi.hoisted(() => ({
  findEntryGroupId: vi.fn(),
  userGroupIds: vi.fn(),
  findEventState: vi.fn(),
  replace: vi.fn(),
}));

vi.mock('./middleware/auth', () => ({
  requireAuth: async (c: Context, next: Next) => {
    const role = c.req.header('X-Test-Role');
    if (!role) return c.json({ success: false, error: 'UNAUTHORIZED' }, 401);
    c.set('user', { id: 'test-user', role });
    return next();
  },
}));
vi.mock('./features/setlist/infrastructure/d1-repository', () => ({
  createD1SetlistRepository: () => repository,
}));

const payload = { items: [{ title: '曲名', artist: 'アーティスト' }], hasSE: false, note: '備考' };
const save = (role?: string, body: unknown = payload) => setlistRoutes.request(`/?entryId=${entryId}`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json', ...(role ? { 'X-Test-Role': role } : {}) },
  body: JSON.stringify(body),
}, { DB: {} });

describe('セットリストの締切後の管理者編集', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    repository.findEntryGroupId.mockResolvedValue(groupId);
    repository.userGroupIds.mockResolvedValue([groupId]);
    repository.findEventState.mockResolvedValue({ isAccepting: false, songLimit: 1 });
    repository.replace.mockResolvedValue(undefined);
  });

  it('管理者モードなら所属外の受付終了済みセットリストをSE・備考とともに保存できる', async () => {
    repository.userGroupIds.mockResolvedValue([]);
    const items = [{ title: '入場SE', artist: 'SE作者' }, ...payload.items];
    const response = await save('ADM', { ...payload, admin: true, hasSE: true, items });
    expect(response.status).toBe(200);
    expect(repository.replace).toHaveBeenCalledWith(entryId, payload.note, true, items, expect.any(String), expect.any(Function));
  });

  it.each(['ADM', 'MBR'])('管理者モードがオフなら受付終了後は保存できない: %s', async (role) => {
    const response = await save(role, { ...payload, admin: false });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'SETLIST_NOT_ACCEPTING' });
    expect(repository.replace).not.toHaveBeenCalled();
  });

  it('一般ユーザーが管理者モードを指定しても保存できない', async () => {
    const response = await save('MBR', { ...payload, admin: true });
    expect(response.status).toBe(403);
    expect(repository.replace).not.toHaveBeenCalled();
  });

  it('管理者モードでも曲数上限は適用され、SEは曲数に含めない', async () => {
    const response = await save('ADM', { ...payload, admin: true, items: [...payload.items, ...payload.items] });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'SONG_LIMIT_EXCEEDED' });
    expect(repository.replace).not.toHaveBeenCalled();
  });

  it('受付中なら一般ユーザーは所属バンドを保存できる', async () => {
    repository.findEventState.mockResolvedValue({ isAccepting: true, songLimit: 1 });
    expect((await save('MBR')).status).toBe(200);
    expect(repository.replace).toHaveBeenCalledOnce();
  });

  it('管理者モードがオフなら所属外は保存できない', async () => {
    repository.userGroupIds.mockResolvedValue([]);
    expect((await save('ADM', { ...payload, admin: false })).status).toBe(403);
    expect(repository.replace).not.toHaveBeenCalled();
  });

  it('未認証は拒否する', async () => {
    expect((await save()).status).toBe(401);
    expect(repository.replace).not.toHaveBeenCalled();
  });

  it('不正な入力は保存しない', async () => {
    expect((await save('ADM', { ...payload, admin: true, items: [{ title: '' }] })).status).toBe(400);
    expect(repository.replace).not.toHaveBeenCalled();
  });
});
