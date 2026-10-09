import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types';
import { EventSetlistBundleItemSchema } from '@shared-schemas';
import { createD1SetlistRepository } from './d1-repository';

const schema = readFileSync(new URL('../../../../schema.sql', import.meta.url), 'utf8');
const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const eventId = id(1);
const now = '2026-10-01T00:00:00.000Z';
const groupIds = [id(2), id(3), id(4), id(5)];

describe('setlist listing at the D1 boundary', () => {
  let sqlite: DatabaseSync;
  let repository: ReturnType<typeof createD1SetlistRepository>;

  beforeEach(() => {
    sqlite = new DatabaseSync(':memory:');
    sqlite.exec(schema);
    sqlite.prepare(`
      INSERT INTO events (id, title, event_date, entry_deadline, setlist_deadline, group_limit, song_limit, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(eventId, 'テスト', '2026-10-10', now, now, 0, 2, now, now);

    // 本バンドの順番と作成日時・出演順を逆にし、自由バンドも先に作成する。
    const groups = [
      { mainIndex: 0, createdAt: '2026-10-04T00:00:00.000Z', position: 4 },
      { mainIndex: 1, createdAt: '2026-10-03T00:00:00.000Z', position: 3 },
      { mainIndex: null, createdAt: '2026-10-02T00:00:00.000Z', position: 2 },
      { mainIndex: null, createdAt: now, position: 1 },
    ];
    groups.forEach((group, index) => {
      sqlite.prepare('INSERT INTO groups (id, name, main_index, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
        .run(groupIds[index], `バンド${index + 1}`, group.mainIndex, now, now);
      sqlite.prepare('INSERT INTO entries (id, event_id, group_id, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id(10 + index), eventId, groupIds[index], group.position, group.createdAt, now);
    });
    for (const position of [2, 0, 1]) {
      sqlite.prepare('INSERT INTO setlist_items (id, entry_id, position, title, artist, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(id(20 + position), id(10), position, `曲${position}`, 'アーティスト', now, now);
    }

    class Statement {
      values: (string | number | null)[] = [];
      constructor(readonly sql: string) {}
      bind(...values: (string | number | null)[]) { this.values = values; return this; }
      async all<T>() { return { results: sqlite.prepare(this.sql).all(...this.values) as T[] }; }
    }
    const db = { prepare: (sql: string) => new Statement(sql) } as unknown as D1Database;
    repository = createD1SetlistRepository(db);
  });

  afterEach(() => sqlite.close());

  const list = async (groupFilter?: string[]) => (await repository.listEvent(eventId, groupFilter))
    .map((item) => EventSetlistBundleItemSchema.parse(item));

  it('管理者一覧は本バンド順を優先し、自由バンドの作成順とSE・曲順を保つ', async () => {
    const items = await list();
    expect(items.map((item) => item.entry.group_id)).toEqual([
      groupIds[0], groupIds[1], groupIds[3], groupIds[2],
    ]);
    expect(items.map(item => item.main_index)).toEqual([0, 1, null, null]);
    expect(items[0].setlist_items.map((item) => item.position)).toEqual([0, 1, 2]);
    expect(items[1].setlist_items).toEqual([]);
  });

  it('本バンドの並べ替えを再取得時に反映する', async () => {
    sqlite.prepare('UPDATE groups SET main_index = NULL WHERE main_index IS NOT NULL').run();
    sqlite.prepare('UPDATE groups SET main_index = ? WHERE id = ?').run(1, groupIds[0]);
    sqlite.prepare('UPDATE groups SET main_index = ? WHERE id = ?').run(0, groupIds[1]);
    expect((await list()).map((item) => item.entry.group_id)).toEqual([
      groupIds[1], groupIds[0], groupIds[3], groupIds[2],
    ]);
  });

  it('一般ユーザーの所属絞り込みでも本バンド順を保ち、対象外を返さない', async () => {
    expect((await list([groupIds[1], groupIds[0]])).map((item) => item.entry.group_id))
      .toEqual([groupIds[0], groupIds[1]]);
    expect(await list([])).toEqual([]);
    expect((await list([groupIds[2], groupIds[3]])).map((item) => item.entry.group_id))
      .toEqual([groupIds[3], groupIds[2]]);
  });
});
