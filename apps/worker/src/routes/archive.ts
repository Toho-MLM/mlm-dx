import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Bindings, Variables } from '../index';
import { requireAuth } from '../middleware/auth';
import type { ApiResponse, Archive } from '../types';

const archiveRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

archiveRoutes.use('*', requireAuth);

archiveRoutes.get('/band/:bandId', async (c: Context<{ Bindings: Bindings }>) => {
  try {
    const user = (c as any).get('user');
    const bandId = c.req.param('bandId');

    const member = await c.env.DB.prepare(
      'SELECT * FROM members WHERE band_id = ? AND user_id = ?'
    ).bind(bandId, user.id).first();

    if (!member) {
      return c.json<ApiResponse>({
        success: false,
        error: 'You are not a member of this band'
      }, 403);
    }

    const { results } = await c.env.DB.prepare(`
      SELECT * FROM archives 
      WHERE band_id = ? 
      ORDER BY created_at DESC
    `).bind(bandId).all();

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

archiveRoutes.post('/band/:bandId', async (c: Context<{ Bindings: Bindings }>) => {
  try {
    const user = (c as any).get('user');
    const bandId = c.req.param('bandId');
    const { title, description, youtube_url } = await c.req.json();

    if (!title) {
      return c.json<ApiResponse>({
        success: false,
        error: 'Title is required'
      }, 400);
    }

    const member = await c.env.DB.prepare(
      'SELECT * FROM members WHERE band_id = ? AND user_id = ?'
    ).bind(bandId, user.id).first();

    if (!member) {
      return c.json<ApiResponse>({
        success: false,
        error: 'You are not a member of this band'
      }, 403);
    }

    const archiveId = crypto.randomUUID();
    const now = new Date().toISOString();

    await c.env.DB.prepare(
      'INSERT INTO archives (id, band_id, title, description, youtube_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      archiveId,
      bandId,
      title,
      description || '',
      youtube_url || '',
      now,
      now
    ).run();

    const archive: Archive = {
      id: archiveId,
      band_id: bandId,
      title,
      description: description || '',
      youtube_url: youtube_url || '',
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

archiveRoutes.put('/:id', async (c: Context<{ Bindings: Bindings }>) => {
  try {
    const user = (c as any).get('user');
    const archiveId = c.req.param('id');
    const { title, description, youtube_url } = await c.req.json();

    const archive = await c.env.DB.prepare(
      'SELECT * FROM archives WHERE id = ?'
    ).bind(archiveId).first() as any;

    if (!archive) {
      return c.json<ApiResponse>({
        success: false,
        error: 'Archive not found'
      }, 404);
    }

    const member = await c.env.DB.prepare(
      'SELECT role FROM members WHERE band_id = ? AND user_id = ?'
    ).bind(archive.band_id, user.id).first() as any;

    if (!member) {
      return c.json<ApiResponse>({
        success: false,
        error: 'You are not a member of this band'
      }, 403);
    }

    await c.env.DB.prepare(
      'UPDATE archives SET title = ?, description = ?, youtube_url = ?, updated_at = ? WHERE id = ?'
    ).bind(
      title,
      description,
      youtube_url,
      new Date().toISOString(),
      archiveId
    ).run();

    const updatedArchive = await c.env.DB.prepare(
      'SELECT * FROM archives WHERE id = ?'
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

archiveRoutes.delete('/:id', async (c: Context<{ Bindings: Bindings }>) => {
  try {
    const user = (c as any).get('user');
    const archiveId = c.req.param('id');

    const archive = await c.env.DB.prepare(
      'SELECT * FROM archives WHERE id = ?'
    ).bind(archiveId).first() as any;

    if (!archive) {
      return c.json<ApiResponse>({
        success: false,
        error: 'Archive not found'
      }, 404);
    }

    const member = await c.env.DB.prepare(
      'SELECT role FROM members WHERE band_id = ? AND user_id = ?'
    ).bind(archive.band_id, user.id).first() as any;

    if (!member || member.role !== 'owner') {
      return c.json<ApiResponse>({
        success: false,
        error: 'Only band owners can delete archives'
      }, 403);
    }

    await c.env.DB.prepare('DELETE FROM archives WHERE id = ?').bind(archiveId).run();

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
