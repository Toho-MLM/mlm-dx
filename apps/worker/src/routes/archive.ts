import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Bindings, Variables } from '../index';
import { requireAuth } from '../middleware/auth';
import type { ApiResponse, Archive } from '../types';

const archiveRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

archiveRoutes.use('*', requireAuth);

archiveRoutes.get('/', async (c: Context<{ Bindings: Bindings; Variables: Variables }>) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT * FROM archive 
      ORDER BY year DESC, created_at DESC
    `).all();

    return c.json<ApiResponse<Archive[]>>({
      success: true,
      data: results as unknown as Archive[]
    });

  } catch (error) {
    console.error('Get archives error:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Internal server error'
    }, 500);
  }
});

archiveRoutes.post('/', async (c: Context<{ Bindings: Bindings; Variables: Variables }>) => {
  try {
    const { title, youtube_url, year } = await c.req.json<Partial<Archive>>();

    if (!title) {
      return c.json<ApiResponse>({
        success: false,
        error: 'Title is required'
      }, 400);
    }

    const archiveId = crypto.randomUUID();
    const now = new Date().toISOString();

    await c.env.DB.prepare(
      'INSERT INTO archive (id, title, youtube_url, year, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(
      archiveId,
      title,
      youtube_url || '',
      year as number,
      now,
      now
    ).run();

    const archive: Archive = {
      id: archiveId,
      title,
      youtube_url: youtube_url || '',
      year: year as number,
      created_at: now,
      updated_at: now
    };

    return c.json<ApiResponse<Archive>>({
      success: true,
      data: archive
    }, 201);

  } catch (error) {
    console.error('Create archive error:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Internal server error'
    }, 500);
  }
});

archiveRoutes.put('/:id', async (c: Context<{ Bindings: Bindings; Variables: Variables }>) => {
  try {
    const archiveId = c.req.param('id');
    const { title, youtube_url, year } = await c.req.json<Partial<Archive>>();

    const archive = await c.env.DB.prepare(
      'SELECT * FROM archive WHERE id = ?'
    ).bind(archiveId).first() as Partial<Archive> | null;

    if (!archive) {
      return c.json<ApiResponse>({
        success: false,
        error: 'Archive not found'
      }, 404);
    }

    await c.env.DB.prepare(
      'UPDATE archive SET title = ?, youtube_url = ?, year = ?, updated_at = ? WHERE id = ?'
    ).bind(
      title,
      youtube_url,
      year as number,
      new Date().toISOString(),
      archiveId
    ).run();

    const updatedArchive = await c.env.DB.prepare(
      'SELECT * FROM archive WHERE id = ?'
    ).bind(archiveId).first() as Archive;

    return c.json<ApiResponse<Archive>>({
      success: true,
      data: updatedArchive
    });

  } catch (error) {
    console.error('Update archive error:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Internal server error'
    }, 500);
  }
});

archiveRoutes.delete('/:id', async (c: Context<{ Bindings: Bindings; Variables: Variables }>) => {
  try {
    const archiveId = c.req.param('id');

    const archive = await c.env.DB.prepare(
      'SELECT * FROM archive WHERE id = ?'
    ).bind(archiveId).first() as Partial<Archive> | null;

    if (!archive) {
      return c.json<ApiResponse>({
        success: false,
        error: 'Archive not found'
      }, 404);
    }

    await c.env.DB.prepare('DELETE FROM archive WHERE id = ?').bind(archiveId).run();

    return c.json<ApiResponse>({
      success: true,
      message: 'Archive deleted successfully'
    });

  } catch (error) {
    console.error('Delete archive error:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Internal server error'
    }, 500);
  }
});

export { archiveRoutes };
