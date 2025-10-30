import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth';
import type { Bindings, Variables } from '../index';
import { getUserGroupIds } from './groups';
import { requireAdmin } from '../utils/admin';
import { z } from 'zod';
import { SetlistItemSchema, CreateSetlistItemRequestSchema, UpdateSetlistItemRequestSchema } from '@shared-schemas';

const setlistRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

setlistRoutes.use('*', requireAuth);

setlistRoutes.post('/', async (c) => {
  try {
    const user = c.get('user');
    const requestData = CreateSetlistItemRequestSchema.parse(await c.req.json());

    const entry = await c.env.DB.prepare(`
      SELECT group_id FROM entries WHERE id = ?
    `).bind(requestData.entry_id).first();

    if (!entry) {
      return c.json({ success: false, error: 'ENTRY_NOT_FOUND' }, 404);
    }

    const isAdminMode = requestData.admin === true;
    
    if (isAdminMode) {
      try {
        requireAdmin(user.role);
      } catch (error) {
        return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403);
      }
    } else {
      const userGroupIds = await getUserGroupIds(c.env, user.id);

      if (!userGroupIds.includes((entry as any).group_id)) {
        return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403);
      }
    }

    const now = new Date().toISOString();
    const newId = crypto.randomUUID();

    await c.env.DB.prepare(`
      INSERT INTO setlist_items (id, entry_id, position, title, artist, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      newId,
      requestData.entry_id,
      requestData.position,
      requestData.title,
      requestData.artist,
      now,
      now
    ).run();

    return c.json({ success: true });
  } catch (error) {
    console.error('Error creating setlist item:', error);
    if (error instanceof z.ZodError) {
      return c.json({ success: false, error: 'INVALID_INPUT' }, 400);
    }
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

setlistRoutes.get('/entry/:entryId', async (c) => {
  try {
    const entryId = c.req.param('entryId');

    const items = await c.env.DB.prepare(`
      SELECT id, entry_id, position, title, artist, created_at, updated_at
      FROM setlist_items
      WHERE entry_id = ?
      ORDER BY position ASC
    `).bind(entryId).all();

    const validatedItems = items.results.map(item => SetlistItemSchema.parse(item));

    return c.json({ success: true, data: validatedItems });
  } catch (error) {
    console.error('Error fetching setlist items:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

setlistRoutes.get('/event/:eventId', async (c) => {
  try {
    const eventId = c.req.param('eventId');

    const rows = await c.env.DB.prepare(`
      SELECT 
        e.id as entry_id,
        e.event_id as entry_event_id,
        e.group_id as entry_group_id,
        e.note as entry_note,
        e.created_at as entry_created_at,
        g.name as group_name,
        s.id as item_id,
        s.position as item_position,
        s.title as item_title,
        s.artist as item_artist,
        s.created_at as item_created_at,
        s.updated_at as item_updated_at
      FROM entries e
      LEFT JOIN groups g ON g.id = e.group_id
      LEFT JOIN setlist_items s ON s.entry_id = e.id
      WHERE e.event_id = ?
      ORDER BY e.created_at ASC, s.position ASC
    `).bind(eventId).all();

    const map = new Map<string, any>();
    for (const r of rows.results as any[]) {
      if (!map.has(r.entry_id)) {
        map.set(r.entry_id, {
          entry: {
            id: r.entry_id,
            event_id: r.entry_event_id,
            group_id: r.entry_group_id,
            note: r.entry_note,
            created_at: r.entry_created_at,
          },
          group_name: r.group_name || '不明なグループ',
          setlist_items: [] as Array<{ id: string; entry_id: string; position: number; title: string; artist: string; created_at: string; updated_at: string }>,
        });
      }
      if (r.item_id) {
        map.get(r.entry_id).setlist_items.push({
          id: r.item_id,
          entry_id: r.entry_id,
          position: r.item_position,
          title: r.item_title,
          artist: r.item_artist || '',
          created_at: r.item_created_at,
          updated_at: r.item_updated_at,
        });
      }
    }

    return c.json({ success: true, data: Array.from(map.values()) });
  } catch (error) {
    console.error('Error fetching event setlist bundle:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

setlistRoutes.put('/:id', async (c) => {
  try {
    const user = c.get('user');
    const itemId = c.req.param('id');

    const item = await c.env.DB.prepare(`
      SELECT entry_id FROM setlist_items WHERE id = ?
    `).bind(itemId).first();

    if (!item) {
      return c.json({ success: false, error: 'SETLIST_ITEM_NOT_FOUND' }, 404);
    }

    const entry = await c.env.DB.prepare(`
      SELECT group_id FROM entries WHERE id = ?
    `).bind((item as any).entry_id).first();

    if (!entry) {
      return c.json({ success: false, error: 'ENTRY_NOT_FOUND' }, 404);
    }

    const requestData = UpdateSetlistItemRequestSchema.parse(await c.req.json());
    
    const isAdminMode = requestData.admin === true;
    
    if (isAdminMode) {
      try {
        requireAdmin(user.role);
      } catch (error) {
        return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403);
      }
    } else {
      const userGroupIds = await getUserGroupIds(c.env, user.id);

      if (!userGroupIds.includes((entry as any).group_id)) {
        return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403);
      }
    }

    const now = new Date().toISOString();

    const updates: string[] = [];
    const values: any[] = [];

    if (requestData.position !== undefined) {
      updates.push('position = ?');
      values.push(requestData.position);
    }
    if (requestData.title !== undefined) {
      updates.push('title = ?');
      values.push(requestData.title);
    }
    if (requestData.artist !== undefined) {
      updates.push('artist = ?');
      values.push(requestData.artist);
    }
    updates.push('updated_at = ?');
    values.push(now);
    values.push(itemId);

    if (updates.length === 1) {
      return c.json({ success: true });
    }

    await c.env.DB.prepare(`
      UPDATE setlist_items
      SET ${updates.join(', ')}
      WHERE id = ?
    `).bind(...values).run();

    return c.json({ success: true });
  } catch (error) {
    console.error('Error updating setlist item:', error);
    if (error instanceof z.ZodError) {
      return c.json({ success: false, error: 'INVALID_INPUT' }, 400);
    }
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

setlistRoutes.delete('/:id', async (c) => {
  try {
    const user = c.get('user');
    const itemId = c.req.param('id');
    
    const adminParam = c.req.query('admin');
    const isAdminMode = adminParam === 'true';

    const item = await c.env.DB.prepare(`
      SELECT entry_id FROM setlist_items WHERE id = ?
    `).bind(itemId).first();

    if (!item) {
      return c.json({ success: false, error: 'SETLIST_ITEM_NOT_FOUND' }, 404);
    }

    const entry = await c.env.DB.prepare(`
      SELECT group_id FROM entries WHERE id = ?
    `).bind((item as any).entry_id).first();

    if (!entry) {
      return c.json({ success: false, error: 'ENTRY_NOT_FOUND' }, 404);
    }

    if (isAdminMode) {
      try {
        requireAdmin(user.role);
      } catch (error) {
        return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403);
      }
    } else {
      const userGroupIds = await getUserGroupIds(c.env, user.id);

      if (!userGroupIds.includes((entry as any).group_id)) {
        return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403);
      }
    }

    await c.env.DB.prepare(`
      DELETE FROM setlist_items WHERE id = ?
    `).bind(itemId).run();

    return c.json({ success: true, message: 'Setlist item deleted successfully' });
  } catch (error) {
    console.error('Error deleting setlist item:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

export { setlistRoutes };

