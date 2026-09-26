import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types';
import { createD1BandDraftRepository } from './d1-repository';

const schema = readFileSync(new URL('../../../../schema.sql', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../../../../migrations/020_single_main_band_draft.sql', import.meta.url), 'utf8');
const now = '2026-09-26T00:00:00.000Z';

describe('single main band draft', () => {
  it('既存の最新下書きを残し、同時作成の二件目を拒否する', async () => {
    const sqlite = new DatabaseSync(':memory:');
    sqlite.exec(schema);
    sqlite.exec('DROP INDEX main_band_drafts_singleton');
    const userId = '00000000-0000-4000-8000-000000000001';
    sqlite.prepare('INSERT INTO users (id, name, email, grade, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(userId, 'Test', 'test@example.invalid', 1, now, now);
    const insert = sqlite.prepare(`
      INSERT INTO main_band_drafts (id, share_token, state_json, created_by, created_at, updated_at)
      VALUES (?, ?, '{}', ?, ?, ?)
    `);
    insert.run('00000000-0000-4000-8000-000000000002', 'old', userId, now, now);
    insert.run('00000000-0000-4000-8000-000000000003', 'latest', userId, '2026-09-26T01:00:00.000Z', now);
    sqlite.exec(migration);

    const db = {
      prepare: (sql: string) => ({
        first: async () => sqlite.prepare(sql).get(),
        bind: (...values: string[]) => ({
          run: async () => {
            const result = sqlite.prepare(sql).run(...values);
            return { meta: { changes: Number(result.changes) } };
          },
        }),
      }),
    } as unknown as D1Database;
    const repository = createD1BandDraftRepository(db);
    expect((await repository.findLatest())?.share_token).toBe('latest');
    expect(await repository.create({
      id: '00000000-0000-4000-8000-000000000004', share_token: 'new',
      state_json: '{}', created_by: userId,
    }, now)).toBe(false);
    expect((await repository.findLatest())?.share_token).toBe('latest');
    sqlite.close();
  });
});
