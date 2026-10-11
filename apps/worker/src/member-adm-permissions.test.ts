import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Context, Next } from 'hono';

const repository = vi.hoisted(() => ({
  findRole: vi.fn(), update: vi.fn(), exists: vi.fn(), delete: vi.fn(),
  existingEmails: vi.fn(), create: vi.fn(), moveUpGrades: vi.fn(),
}));
vi.mock('./middleware/auth', () => ({ requireAuth: async (c: Context, next: Next) => {
  const role = c.req.header('X-Test-Role');
  if (!role) return c.json({ success: false, error: 'UNAUTHORIZED' }, 401);
  c.set('user', { id: 'actor', role });
  return next();
} }));
vi.mock('./features/members/infrastructure/d1-repository', () => ({ createD1MemberRepository: () => repository }));
import { memberRoutes } from './routes/members';

const id = '00000000-0000-4000-8000-000000000001';
const payload = { nickname: 'テスト', grade: 2, instruments: [], role: 'ADM' };
const editors = ['MGR', 'CHF', 'MAC', 'NHD', 'NAC'];
const request = (method: string, role?: string, body?: unknown, path = `/${id}`) => memberRoutes.request(path, {
  method, headers: { 'Content-Type': 'application/json', ...(role ? { 'X-Test-Role': role } : {}) },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
}, { DB: {} });

beforeEach(() => {
  vi.resetAllMocks();
  repository.findRole.mockResolvedValue('MBR');
  repository.update.mockResolvedValue(true);
  repository.exists.mockResolvedValue(true);
  repository.delete.mockResolvedValue(true);
  repository.existingEmails.mockResolvedValue(new Set());
});

describe('ADMの付与・降格・削除', () => {
  it.each(editors)('EditorはADMを付与・降格できず、CSVも一件も保存しない: %s', async (role) => {
    expect((await request('PUT', role, payload)).status).toBe(403);
    repository.findRole.mockResolvedValue('ADM');
    expect((await request('PUT', role, { ...payload, role: 'MBR' })).status).toBe(403);
    const members = [
      { name: '部員', email: 'member@example.invalid', grade: 2 },
      { name: 'ADM', email: 'adm@example.invalid', grade: 2, role: 'ADM' },
    ];
    expect((await request('POST', role, { members }, '/bulk')).status).toBe(403);
    expect(repository.update).not.toHaveBeenCalled();
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('ADMは付与・降格・削除・CSV登録ができる', async () => {
    expect((await request('PUT', 'ADM', payload)).status).toBe(200);
    repository.findRole.mockResolvedValue('ADM');
    expect((await request('PUT', 'ADM', { ...payload, role: 'MBR' })).status).toBe(200);
    expect(repository.update).toHaveBeenLastCalledWith(id, expect.objectContaining({ role: 'MBR' }), expect.any(String), true);
    expect((await request('DELETE', 'ADM')).status).toBe(200);
    expect(repository.delete).toHaveBeenCalledWith(id, true);
    expect((await request('POST', 'ADM', { members: [{ name: 'ADM', email: 'adm@example.invalid', grade: 2, role: 'ADM' }] }, '/bulk')).status).toBe(200);
    expect(repository.create).toHaveBeenCalledOnce();
  });

  it('Editorは通常の役職変更・ADMの役職を維持するプロフィール編集ができる', async () => {
    expect((await request('PUT', 'CHF', { ...payload, role: 'MGR' })).status).toBe(200);
    repository.findRole.mockResolvedValue('ADM');
    expect((await request('PUT', 'CHF', payload)).status).toBe(200);
    expect(repository.update).toHaveBeenLastCalledWith(id, expect.objectContaining({ role: 'ADM' }), expect.any(String), false);
  });

  it('DB書き込み時にADMの変更・削除が拒否された場合は403', async () => {
    repository.update.mockResolvedValue(false);
    expect((await request('PUT', 'CHF', { ...payload, role: 'MGR' })).status).toBe(403);
    repository.delete.mockResolvedValue(false);
    expect((await request('DELETE', 'CHF')).status).toBe(403);
    expect(repository.delete).toHaveBeenCalledWith(id, false);
    repository.moveUpGrades.mockResolvedValue(null);
    expect((await request('POST', 'CHF', undefined, '/move-up-grade')).status).toBe(403);
  });

  it.each(editors)('Editorは通常メンバーの削除・学年繰上ができる: %s', async (role) => {
    expect((await request('DELETE', role)).status).toBe(200);
    expect(repository.delete).toHaveBeenCalledWith(id, false);
    repository.moveUpGrades.mockResolvedValue({ deletedCount: 1, movedUpCount: 2 });
    expect((await request('POST', role, undefined, '/move-up-grade')).status).toBe(200);
    expect(repository.moveUpGrades).toHaveBeenCalledWith(expect.any(String), false);
  });

  it('未認証・MBRは拒否、存在しないメンバーは404', async () => {
    expect((await request('PUT', undefined, payload)).status).toBe(401);
    expect((await request('PUT', 'MBR', payload)).status).toBe(403);
    repository.findRole.mockResolvedValue(null);
    expect((await request('PUT', 'ADM', payload)).status).toBe(404);
    expect(repository.update).not.toHaveBeenCalled();
  });
});
