import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth';
import type { Bindings, Variables } from '../index';
import { getUserGroupIds } from './groups';
import { requireAdmin } from '../utils/admin';
import { z } from 'zod';
import { CreateSetlistItemRequestSchema, ReplaceSetlistItemsRequestSchema } from '@shared-schemas';

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

    const acceptRow = await c.env.DB.prepare(`
      SELECT ev.is_setlist_accepting, ev.setlist_deadline
      FROM entries e JOIN events ev ON ev.id = e.event_id
      WHERE e.id = ?
    `).bind(requestData.entry_id).first();

    if (!acceptRow) {
      return c.json({ success: false, error: 'EVENT_NOT_FOUND' }, 404);
    }

    const isSetlistAccepting = Boolean((acceptRow as any).is_setlist_accepting);
    const setlistDeadline = new Date((acceptRow as any).setlist_deadline);
    const nowTime = new Date();

    if (!isSetlistAccepting) {
      return c.json({ success: false, error: 'SETLIST_NOT_ACCEPTING' }, 400);
    }
    if (nowTime >= setlistDeadline) {
      return c.json({ success: false, error: 'SETLIST_DEADLINE_PASSED' }, 400);
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

 

setlistRoutes.get('/event/:eventId', async (c) => {
  try {
    const eventId = c.req.param('eventId');

    const rows = await c.env.DB.prepare(`
      SELECT 
        e.id as entry_id,
        e.event_id as entry_event_id,
        e.group_id as entry_group_id,
        e.note as entry_note,
        g.name as group_name,
        s.position as item_position,
        s.title as item_title,
        s.artist as item_artist
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
          },
          group_name: r.group_name || '不明なグループ',
          setlist_items: [] as Array<{ position: number; title: string; artist: string }>,
        });
      }
      if (r.item_position !== null && r.item_position !== undefined) {
        map.get(r.entry_id).setlist_items.push({
          position: r.item_position,
          title: r.item_title,
          artist: r.item_artist || '',
        });
      }
    }

    const data = Array.from(map.values()).map((v: any) => ({
      ...v,
      setlist_items: v.setlist_items.sort((a: any, b: any) => a.position - b.position),
    }));

    return c.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching event setlist bundle:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

// 一括置換: エントリのセットリストを丸ごと上書き
setlistRoutes.put('/', async (c) => {
  try {
    const user = c.get('user');
    const entryId = c.req.query('entryId');

    if (!entryId) {
      return c.json({ success: false, error: 'INVALID_INPUT' }, 400);
    }

    const entry = await c.env.DB.prepare(`
      SELECT group_id FROM entries WHERE id = ?
    `).bind(entryId).first();

    if (!entry) {
      return c.json({ success: false, error: 'ENTRY_NOT_FOUND' }, 404);
    }

    const body = await c.req.json();
    const reqData = ReplaceSetlistItemsRequestSchema.parse(body);

    const isAdminMode = reqData.admin === true;
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

    const eventRow = await c.env.DB.prepare(`
      SELECT e.event_id, ev.song_limit, ev.is_setlist_accepting, ev.setlist_deadline
      FROM entries e JOIN events ev ON ev.id = e.event_id WHERE e.id = ?
    `).bind(entryId).first();
    if (!eventRow) {
      return c.json({ success: false, error: 'EVENT_NOT_FOUND' }, 404);
    }
    const songLimit = (eventRow as any).song_limit as number;

    const isSetlistAccepting = Boolean((eventRow as any).is_setlist_accepting);
    const setlistDeadline = new Date((eventRow as any).setlist_deadline);
    const nowTime = new Date();

    if (!isSetlistAccepting) {
      return c.json({ success: false, error: 'SETLIST_NOT_ACCEPTING' }, 400);
    }
    if (nowTime >= setlistDeadline) {
      return c.json({ success: false, error: 'SETLIST_DEADLINE_PASSED' }, 400);
    }
    const songsOnly = reqData.hasSE ? reqData.items.slice(1) : reqData.items;
    if (songsOnly.length > songLimit) {
      return c.json({ success: false, error: 'SONG_LIMIT_EXCEEDED' }, 400);
    }

    if (reqData.hasSE) {
      const se = reqData.items[0];
      if (!se) {
        return c.json({ success: false, error: 'INVALID_INPUT' }, 400);
      }
      const existingEntrance = await c.env.DB.prepare(`
        SELECT id FROM setlist_items WHERE entry_id = ? AND position = 0
      `).bind(entryId).first();
      if (existingEntrance) {
        await c.env.DB.prepare(`
          UPDATE setlist_items SET title = ?, artist = ?, updated_at = ? WHERE id = ?
        `).bind(se.title, se.artist || '', now, (existingEntrance as any).id).run();
      } else {
        await c.env.DB.prepare(`
          INSERT INTO setlist_items (id, entry_id, position, title, artist, created_at, updated_at)
          VALUES (?, ?, 0, ?, ?, ?, ?)
        `).bind(crypto.randomUUID(), entryId, se.title, se.artist || '', now, now).run();
      }
    } else {
      await c.env.DB.prepare(`DELETE FROM setlist_items WHERE entry_id = ? AND position = 0`).bind(entryId).run();
    }

    const itemsSorted = songsOnly.map((it, idx) => ({
      title: it.title,
      artist: it.artist || '',
      position: idx + 1,
    }));

    const existing = await c.env.DB.prepare(`
      SELECT id, position FROM setlist_items WHERE entry_id = ? AND position > 0 ORDER BY position ASC
    `).bind(entryId).all();

    const existingItems = (existing.results as any[]).map(r => ({ id: r.id as string, position: r.position as number }));

    const updatesCount = Math.min(existingItems.length, itemsSorted.length);

    const statements = [] as any[];

    for (let i = 0; i < updatesCount; i++) {
      const target = existingItems[i];
      const src = itemsSorted[i];
      statements.push(
        c.env.DB.prepare(`
          UPDATE setlist_items
          SET title = ?, artist = ?, updated_at = ?
          WHERE id = ?
        `).bind(src.title, src.artist, now, target.id)
      );
    }

    if (existingItems.length > itemsSorted.length) {
      for (let i = itemsSorted.length; i < existingItems.length; i++) {
        const target = existingItems[i];
        statements.push(
          c.env.DB.prepare(`
            DELETE FROM setlist_items WHERE id = ?
          `).bind(target.id)
        );
      }
    }

    if (itemsSorted.length > existingItems.length) {
      for (let i = existingItems.length; i < itemsSorted.length; i++) {
        const src = itemsSorted[i];
        statements.push(
          c.env.DB.prepare(`
            INSERT INTO setlist_items (id, entry_id, position, title, artist, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).bind(crypto.randomUUID(), entryId, src.position, src.title, src.artist, now, now)
        );
      }
    }

    if (statements.length > 0) {
      await c.env.DB.batch(statements);
    }

    return c.json({ success: true });
  } catch (error) {
    console.error('Error replacing setlist items:', error);
    if (error instanceof z.ZodError) {
      return c.json({ success: false, error: 'INVALID_INPUT' }, 400);
    }
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

 

 

export { setlistRoutes };

