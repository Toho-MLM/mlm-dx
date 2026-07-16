import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth';
import type { Bindings, Variables } from '../index';
import { getUserGroupIds } from './groups';
import { requireAdmin } from '../utils/admin';
import { z } from 'zod';
import { CreateSetlistItemRequestSchema, ReplaceSetlistItemsRequestSchema } from '@shared-schemas';
import { ensureMainBandEntries } from '../utils/main-band-entries';

const setlistRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

setlistRoutes.use('*', requireAuth);

setlistRoutes.post('/', async (c) => {
  try {
    const user = c.get('user');
    const requestData = CreateSetlistItemRequestSchema.parse(await c.req.json());

    const entry = await c.env.DB.prepare(`
      SELECT group_id FROM entries WHERE id = ?
    `).bind(requestData.entry_id).first<{ group_id: string }>();

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

      if (!userGroupIds.includes(entry.group_id)) {
        return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403);
      }
    }

    const acceptRow = await c.env.DB.prepare(`
      SELECT ev.is_setlist_accepting
      FROM entries e JOIN events ev ON ev.id = e.event_id
      WHERE e.id = ?
    `).bind(requestData.entry_id).first<{ is_setlist_accepting: number | boolean }>();

    if (!acceptRow) {
      return c.json({ success: false, error: 'EVENT_NOT_FOUND' }, 404);
    }

    if (!isAdminMode) {
      const isSetlistAccepting = Boolean(acceptRow.is_setlist_accepting);
      if (!isSetlistAccepting) {
        return c.json({ success: false, error: 'SETLIST_NOT_ACCEPTING' }, 400);
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

 

setlistRoutes.get('/event/:eventId', async (c) => {
  try {
    const user = c.get('user');
    const eventId = c.req.param('eventId');
    const adminParam = c.req.query('admin');
    const isAdminMode = adminParam === 'true';

    if (isAdminMode) {
      try {
        requireAdmin(user.role);
      } catch (error) {
        return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403);
      }
    }

    await ensureMainBandEntries(c.env, eventId);

    let query: string;
    let params: (string | number)[];

    if (isAdminMode) {
      query = `
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
      `;
      params = [eventId];
    } else {
      const userGroupIds = await getUserGroupIds(c.env, user.id);
      if (userGroupIds.length === 0) {
        return c.json({ success: true, data: [] });
      }
      const placeholders = userGroupIds.map(() => '?').join(',');
      query = `
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
        WHERE e.event_id = ? AND e.group_id IN (${placeholders})
        ORDER BY e.created_at ASC, s.position ASC
      `;
      params = [eventId, ...userGroupIds];
    }

    type SetlistRow = {
      entry_id: string;
      entry_event_id: string;
      entry_group_id: string;
      entry_note: string | null;
      group_name: string | null;
      item_position: number | null;
      item_title: string | null;
      item_artist: string | null;
    };

    const rows = await c.env.DB.prepare(query).bind(...params).all<SetlistRow>();

    const map = new Map<string, {
      entry: {
        id: string;
        event_id: string;
        group_id: string;
        note: string | null;
      };
      group_name: string;
      setlist_items: Array<{ position: number; title: string; artist: string }>;
    }>();
    
    for (const r of rows.results) {
      if (!map.has(r.entry_id)) {
        map.set(r.entry_id, {
          entry: {
            id: r.entry_id,
            event_id: r.entry_event_id,
            group_id: r.entry_group_id,
            note: r.entry_note,
          },
          group_name: r.group_name || '不明なグループ',
          setlist_items: [],
        });
      }
      if (r.item_position !== null && r.item_position !== undefined && r.item_title !== null) {
        map.get(r.entry_id)!.setlist_items.push({
          position: r.item_position,
          title: r.item_title,
          artist: r.item_artist || '',
        });
      }
    }

    const data = Array.from(map.values()).map((v) => ({
      ...v,
      setlist_items: v.setlist_items.sort((a, b) => a.position - b.position),
    }));

    return c.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching event setlist bundle:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

setlistRoutes.put('/', async (c) => {
  try {
    const user = c.get('user');
    const entryId = c.req.query('entryId');

    if (!entryId) {
      return c.json({ success: false, error: 'INVALID_INPUT' }, 400);
    }

    const entry = await c.env.DB.prepare(`
      SELECT group_id FROM entries WHERE id = ?
    `).bind(entryId).first<{ group_id: string }>();

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
      if (!userGroupIds.includes(entry.group_id)) {
        return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403);
      }
    }

    const now = new Date().toISOString();

    const eventRow = await c.env.DB.prepare(`
      SELECT e.event_id, ev.song_limit, ev.is_setlist_accepting
      FROM entries e JOIN events ev ON ev.id = e.event_id WHERE e.id = ?
    `).bind(entryId).first<{ event_id: string; song_limit: number; is_setlist_accepting: number | boolean }>();
    if (!eventRow) {
      return c.json({ success: false, error: 'EVENT_NOT_FOUND' }, 404);
    }
    const songLimit = eventRow.song_limit;

    if (!isAdminMode) {
      const isSetlistAccepting = Boolean(eventRow.is_setlist_accepting);
      if (!isSetlistAccepting) {
        return c.json({ success: false, error: 'SETLIST_NOT_ACCEPTING' }, 400);
      }
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
      `).bind(entryId).first<{ id: string }>();
      if (existingEntrance) {
        await c.env.DB.prepare(`
          UPDATE setlist_items SET title = ?, artist = ?, updated_at = ? WHERE id = ?
        `).bind(se.title, se.artist || '', now, existingEntrance.id).run();
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
    `).bind(entryId).all<{ id: string; position: number }>();

    const existingItems = existing.results.map(r => ({ id: r.id, position: r.position }));

    const updatesCount = Math.min(existingItems.length, itemsSorted.length);

    const statements: ReturnType<typeof c.env.DB.prepare>[] = [];

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
