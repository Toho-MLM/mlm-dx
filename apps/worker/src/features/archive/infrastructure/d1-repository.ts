import type { D1Database } from '@cloudflare/workers-types';
import type { ArchiveRecord, ArchiveRepository } from '../application/repository';

export function createD1ArchiveRepository(db: D1Database): ArchiveRepository {
  return {
    async list() {
      const rows = await db.prepare(`
        SELECT id, title, youtube_url, year FROM archives ORDER BY year DESC, created_at DESC
      `).all<ArchiveRecord>();
      return (rows.results ?? []).map((row) => ({ ...row, year: Number(row.year) }));
    },
    async exists(id) {
      return Boolean(await db.prepare('SELECT id FROM archives WHERE id = ?').bind(id).first());
    },
    async create(input, createdAt) {
      await db.prepare(`
        INSERT INTO archives (id, title, youtube_url, year, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
      `).bind(input.id, input.title, input.youtube_url, input.year, createdAt, createdAt).run();
    },
    async update(input, updatedAt) {
      await db.prepare(`
        UPDATE archives SET title = ?, youtube_url = ?, year = ?, updated_at = ? WHERE id = ?
      `).bind(input.title, input.youtube_url, input.year, updatedAt, input.id).run();
    },
    async delete(id) {
      await db.prepare('DELETE FROM archives WHERE id = ?').bind(id).run();
    },
  };
}
