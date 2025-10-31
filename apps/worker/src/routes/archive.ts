import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Bindings, Variables } from '../index';
import { requireAuth } from '../middleware/auth';
import { requireAdmin } from '../utils/admin';
import type { ApiResponse, Archive } from '../types';

const archiveRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

archiveRoutes.use('*', requireAuth);

archiveRoutes.get('/', async (c: Context<{ Bindings: Bindings; Variables: Variables }>) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT * FROM archives 
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
      error: 'INTERNAL_SERVER_ERROR'
    }, 500);
  }
});

archiveRoutes.post('/', async (c: Context<{ Bindings: Bindings; Variables: Variables }>) => {
  try {
    requireAdmin(c.get('user').role);
    
    const { title, youtube_url, year } = await c.req.json<Partial<Archive>>();

    if (!title) {
      return c.json<ApiResponse>({
        success: false,
        error: 'TITLE_REQUIRED'
      }, 400);
    }

    const archiveId = crypto.randomUUID();
    const now = new Date().toISOString();

    await c.env.DB.prepare(
      'INSERT INTO archives (id, title, youtube_url, year, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(
      archiveId,
      title,
      youtube_url || '',
      year as number,
      now,
      now
    ).run();

    return c.json<ApiResponse>({ success: true }, 201);

  } catch (error) {
    console.error('Create archive error:', error);
    if (error instanceof Error && error.message === 'INSUFFICIENT_PERMISSIONS') {
      return c.json<ApiResponse>({
        success: false,
        error: 'INSUFFICIENT_PERMISSIONS'
      }, 403);
    }
    return c.json<ApiResponse>({
      success: false,
      error: 'INTERNAL_SERVER_ERROR'
    }, 500);
  }
});

archiveRoutes.put('/:id', async (c: Context<{ Bindings: Bindings; Variables: Variables }>) => {
  try {
    requireAdmin(c.get('user').role);
    
    const archiveId = c.req.param('id');
    const { title, youtube_url, year } = await c.req.json<Partial<Archive>>();

    const archive = await c.env.DB.prepare(
      'SELECT * FROM archives WHERE id = ?'
    ).bind(archiveId).first() as Partial<Archive> | null;

    if (!archive) {
      return c.json<ApiResponse>({
        success: false,
        error: 'ARCHIVE_NOT_FOUND'
      }, 404);
    }

    await c.env.DB.prepare(
      'UPDATE archives SET title = ?, youtube_url = ?, year = ?, updated_at = ? WHERE id = ?'
    ).bind(
      title,
      youtube_url,
      year as number,
      new Date().toISOString(),
      archiveId
    ).run();

    return c.json<ApiResponse>({ success: true });

  } catch (error) {
    console.error('Update archive error:', error);
    if (error instanceof Error && error.message === 'INSUFFICIENT_PERMISSIONS') {
      return c.json<ApiResponse>({
        success: false,
        error: 'INSUFFICIENT_PERMISSIONS'
      }, 403);
    }
    return c.json<ApiResponse>({
      success: false,
      error: 'INTERNAL_SERVER_ERROR'
    }, 500);
  }
});

archiveRoutes.delete('/:id', async (c: Context<{ Bindings: Bindings; Variables: Variables }>) => {
  try {
    requireAdmin(c.get('user').role);
    
    const archiveId = c.req.param('id');

    const archive = await c.env.DB.prepare(
      'SELECT * FROM archives WHERE id = ?'
    ).bind(archiveId).first() as Partial<Archive> | null;

    if (!archive) {
      return c.json<ApiResponse>({
        success: false,
        error: 'ARCHIVE_NOT_FOUND'
      }, 404);
    }

    await c.env.DB.prepare('DELETE FROM archives WHERE id = ?').bind(archiveId).run();

    return c.json<ApiResponse>({
      success: true,
      message: 'Archive deleted successfully'
    });

  } catch (error) {
    console.error('Delete archive error:', error);
    if (error instanceof Error && error.message === 'INSUFFICIENT_PERMISSIONS') {
      return c.json<ApiResponse>({
        success: false,
        error: 'INSUFFICIENT_PERMISSIONS'
      }, 403);
    }
    return c.json<ApiResponse>({
      success: false,
      error: 'INTERNAL_SERVER_ERROR'
    }, 500);
  }
});

export { archiveRoutes };
