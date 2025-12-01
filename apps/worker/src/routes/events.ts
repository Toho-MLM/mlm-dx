import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth';
import type { Bindings, Variables } from '../index';
import { requireAdmin } from '../utils/admin';
import { z } from 'zod';
import { EventSchema, CreateEventRequestSchema, UpdateEventRequestSchema } from '@shared-schemas';

function validateEventDates(entryDeadline: string, setlistDeadline: string, eventDate: string): boolean {
  const entry = new Date(entryDeadline)
  const setlist = new Date(setlistDeadline)
  const event = new Date(eventDate)

  return entry <= setlist && setlist < event
}

const eventRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

eventRoutes.use('*', requireAuth);

eventRoutes.post('/', async (c) => {
  try {
    requireAdmin(c.get('user').role);

    const requestData = CreateEventRequestSchema.parse(await c.req.json());

    if (!validateEventDates(requestData.entry_deadline, requestData.setlist_deadline, requestData.event_date)) {
      return c.json({ success: false, error: 'INVALID_DATE_ORDER' }, 400);
    }

    const now = new Date().toISOString();
    const newId = crypto.randomUUID();
    
    const songLimit = requestData.song_limit ?? 2;
    
    await c.env.DB.prepare(`
      INSERT INTO events (id, title, event_date, entry_deadline, is_entry_accepting, setlist_deadline, is_setlist_accepting, group_limit, song_limit, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      newId,
      requestData.title,
      requestData.event_date,
      requestData.entry_deadline,
      requestData.is_entry_accepting ? 1 : 0,
      requestData.setlist_deadline,
      requestData.is_setlist_accepting ? 1 : 0,
      requestData.group_limit,
      songLimit,
      now,
      now
    ).run();
    
    return c.json({ success: true });
  } catch (error) {
    console.error('Error creating event:', error);
    if (error instanceof Error && error.message === 'INSUFFICIENT_PERMISSIONS') {
      return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403);
    }
    if (error instanceof z.ZodError) {
      return c.json({ success: false, error: 'INVALID_INPUT' }, 400);
    }
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

eventRoutes.get('/', async (c) => {
  try {
    const events = await c.env.DB.prepare(`
      SELECT id, title, event_date, entry_deadline, is_entry_accepting, setlist_deadline, is_setlist_accepting, group_limit, song_limit, created_at, updated_at
      FROM events
      ORDER BY event_date ASC
    `).all();

    const validatedEvents = events.results.map(event => ({
      ...event,
      is_entry_accepting: Boolean(event.is_entry_accepting),
      is_setlist_accepting: Boolean(event.is_setlist_accepting),
    })).map(event => EventSchema.parse(event));

    return c.json({ success: true, data: validatedEvents });
  } catch (error) {
    console.error('Error fetching events:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

eventRoutes.put('/:id', async (c) => {
  try {
    requireAdmin(c.get('user').role);

    const eventId = c.req.param('id');
    const requestData = UpdateEventRequestSchema.parse(await c.req.json());

    if (!validateEventDates(requestData.entry_deadline, requestData.setlist_deadline, requestData.event_date)) {
      return c.json({ success: false, error: 'INVALID_DATE_ORDER' }, 400);
    }

    const now = new Date().toISOString();

    const oldEvent = await c.env.DB.prepare(`
      SELECT group_limit, song_limit FROM events WHERE id = ?
    `).bind(eventId).first<{ group_limit: number; song_limit: number }>();

    const oldGroupLimit = oldEvent?.group_limit ?? null;
    const oldSongLimit = oldEvent?.song_limit ?? null;
    const songLimit = requestData.song_limit !== undefined ? requestData.song_limit : oldSongLimit;

    await c.env.DB.prepare(`
      UPDATE events 
      SET title = ?, event_date = ?, entry_deadline = ?, is_entry_accepting = ?, setlist_deadline = ?, is_setlist_accepting = ?, group_limit = ?, song_limit = ?, updated_at = ?
      WHERE id = ?
    `).bind(
      requestData.title,
      requestData.event_date,
      requestData.entry_deadline,
      requestData.is_entry_accepting ? 1 : 0,
      requestData.setlist_deadline,
      requestData.is_setlist_accepting ? 1 : 0,
      requestData.group_limit,
      songLimit,
      now,
      eventId
    ).run();

    if (oldGroupLimit !== null && requestData.group_limit !== oldGroupLimit) {
      if (requestData.group_limit === 0) {
        await c.env.DB.prepare(`
          DELETE FROM entries WHERE event_id = ?
        `).bind(eventId).run();
      } else if (requestData.group_limit < oldGroupLimit) {
        const entries = await c.env.DB.prepare(`
          SELECT id, group_id, created_at
          FROM entries
          WHERE event_id = ?
          ORDER BY created_at DESC
        `).bind(eventId).all<{ id: string; group_id: string; created_at: string }>();

        const groupCountMap = new Map<string, number>();
        const groupEntriesMap = new Map<string, Array<{ id: string; group_id: string; created_at: string }>>();
        
        for (const entry of entries.results) {
          groupCountMap.set(entry.group_id, (groupCountMap.get(entry.group_id) || 0) + 1);
          if (!groupEntriesMap.has(entry.group_id)) {
            groupEntriesMap.set(entry.group_id, []);
          }
          groupEntriesMap.get(entry.group_id)!.push(entry);
        }

        const entriesToDelete: string[] = [];
        for (const [groupId, count] of groupCountMap) {
          if (count > requestData.group_limit) {
            const toDelete = count - requestData.group_limit;
            const groupEntries = groupEntriesMap.get(groupId) || [];
            for (let i = 0; i < toDelete; i++) {
              entriesToDelete.push(groupEntries[i].id);
            }
          }
        }

        for (const entryId of entriesToDelete) {
          await c.env.DB.prepare(`
            DELETE FROM entries WHERE id = ?
          `).bind(entryId).run();
        }
      }
    }

    if (oldSongLimit !== null && songLimit !== null && songLimit !== oldSongLimit) {
      if (songLimit === 0) {
        const entries = await c.env.DB.prepare(`
          SELECT id FROM entries WHERE event_id = ?
        `).bind(eventId).all<{ id: string }>();

        for (const entry of entries.results) {
          await c.env.DB.prepare(`
            DELETE FROM setlist_items WHERE entry_id = ?
          `).bind(entry.id).run();
        }
      } else if (songLimit < oldSongLimit) {
        const entries = await c.env.DB.prepare(`
          SELECT id FROM entries WHERE event_id = ?
        `).bind(eventId).all<{ id: string }>();

        for (const entry of entries.results) {
          const setlistItems = await c.env.DB.prepare(`
            SELECT id, position
            FROM setlist_items
            WHERE entry_id = ?
            ORDER BY position DESC
          `).bind(entry.id).all<{ id: string; position: number }>();

          const itemCount = setlistItems.results.length;
          if (itemCount > songLimit) {
            const toDelete = itemCount - songLimit;
            for (let i = 0; i < toDelete; i++) {
              await c.env.DB.prepare(`
                DELETE FROM setlist_items WHERE id = ?
              `).bind(setlistItems.results[i].id).run();
            }
          }
        }
      }
    }

    return c.json({ success: true });
  } catch (error) {
    console.error('Error updating event:', error);
    if (error instanceof Error && error.message === 'INSUFFICIENT_PERMISSIONS') {
      return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403);
    }
    if (error instanceof z.ZodError) {
      return c.json({ success: false, error: 'INVALID_INPUT' }, 400);
    }
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

eventRoutes.delete('/:id', async (c) => {
  try {
    requireAdmin(c.get('user').role);

    const eventId = c.req.param('id');

    await c.env.DB.prepare(`
      DELETE FROM events WHERE id = ?
    `).bind(eventId).run();

    return c.json({ success: true, message: 'Event deleted successfully' });
  } catch (error) {
    console.error('Error deleting event:', error);
    if (error instanceof Error && error.message === 'INSUFFICIENT_PERMISSIONS') {
      return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403);
    }
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

export { eventRoutes };

