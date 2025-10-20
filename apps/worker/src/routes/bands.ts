import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Bindings, Variables } from '../index';
import { requireAuth } from '../middleware/auth';
import type { ApiResponse, Band } from '../types';

const bandRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

bandRoutes.use('*', requireAuth);

bandRoutes.get('/', async (c: Context<{ Bindings: Bindings }>) => {
  try {
    const user = (c as unknown).get('user');
    
    const { results } = await c.env.DB.prepare(`
      SELECT b.*, m.role 
      FROM bands b
      JOIN members m ON b.id = m.band_id
      WHERE m.user_id = ?
      ORDER BY b.created_at DESC
    `).bind(user.id).all();

    return c.json<ApiResponse<Band[]>>({
      success: true,
      data: results as unknown as Band[]
    });

  } catch (error) {
    console.error('Get bands error:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Internal server error'
    }, 500);
  }
});

bandRoutes.post('/', async (c: Context<{ Bindings: Bindings }>) => {
  try {
    const user = (c as unknown).get('user');
    const { name, description } = await c.req.json();

    if (!name) {
      return c.json<ApiResponse>({
        success: false,
        error: 'Band name is required'
      }, 400);
    }

    const bandId = crypto.randomUUID();
    const now = new Date().toISOString();

    await c.env.DB.prepare(
      'INSERT INTO bands (id, name, description, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(bandId, name, description || '', user.id, now, now).run();

    await c.env.DB.prepare(
      'INSERT INTO members (id, band_id, user_id, role, joined_at) VALUES (?, ?, ?, ?, ?)'
    ).bind(crypto.randomUUID(), bandId, user.id, 'owner', now).run();

    const band: Band = {
      id: bandId,
      name,
      description: description || '',
      created_by: user.id,
      created_at: now,
      updated_at: now
    };

    return c.json<ApiResponse<Band>>({
      success: true,
      data: band
    }, 201);

  } catch (error) {
    console.error('Create band error:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Internal server error'
    }, 500);
  }
});

bandRoutes.get('/:id', async (c: Context<{ Bindings: Bindings }>) => {
  try {
    const user = (c as unknown).get('user');
    const bandId = c.req.param('id');

    const band = await c.env.DB.prepare(`
      SELECT b.*, m.role 
      FROM bands b
      JOIN members m ON b.id = m.band_id
      WHERE b.id = ? AND m.user_id = ?
    `).bind(bandId, user.id).first() as Band;

    if (!band) {
      return c.json<ApiResponse>({
        success: false,
        error: 'Band not found'
      }, 404);
    }

    return c.json<ApiResponse<Band>>({
      success: true,
      data: band
    });

  } catch (error) {
    console.error('Get band error:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Internal server error'
    }, 500);
  }
});

bandRoutes.put('/:id', async (c: Context<{ Bindings: Bindings }>) => {
  try {
    const user = (c as unknown).get('user');
    const bandId = c.req.param('id');
    const { name, description } = await c.req.json();

    const member = await c.env.DB.prepare(
      'SELECT role FROM members WHERE band_id = ? AND user_id = ?'
    ).bind(bandId, user.id).first() as unknown;

    if (!member || member.role !== 'owner') {
      return c.json<ApiResponse>({
        success: false,
        error: 'Only band owners can update bands'
      }, 403);
    }

    await c.env.DB.prepare(
      'UPDATE bands SET name = ?, description = ?, updated_at = ? WHERE id = ?'
    ).bind(name, description, new Date().toISOString(), bandId).run();

    const band = await c.env.DB.prepare(
      'SELECT * FROM bands WHERE id = ?'
    ).bind(bandId).first() as Band;

    return c.json<ApiResponse<Band>>({
      success: true,
      data: band
    });

  } catch (error) {
    console.error('Update band error:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Internal server error'
    }, 500);
  }
});

bandRoutes.delete('/:id', async (c: Context<{ Bindings: Bindings }>) => {
  try {
    const user = (c as unknown).get('user');
    const bandId = c.req.param('id');

    const member = await c.env.DB.prepare(
      'SELECT role FROM members WHERE band_id = ? AND user_id = ?'
    ).bind(bandId, user.id).first() as unknown;

    if (!member || member.role !== 'owner') {
      return c.json<ApiResponse>({
        success: false,
        error: 'Only band owners can delete bands'
      }, 403);
    }

    await c.env.DB.prepare('DELETE FROM bands WHERE id = ?').bind(bandId).run();

    return c.json<ApiResponse>({
      success: true,
      message: 'Band deleted successfully'
    });

  } catch (error) {
    console.error('Delete band error:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Internal server error'
    }, 500);
  }
});

export { bandRoutes };
