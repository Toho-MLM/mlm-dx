import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth';
import type { Bindings, Variables } from '../index';
import { requireAdmin } from '../utils/admin';
import { z } from 'zod';
import { EventSchema, CreateEventRequestSchema, UpdateEventRequestSchema } from '@shared-schemas';
import { parseUuid } from '../utils/uuid';

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

    const eventId = parseUuid(c.req.param('id'));
    if (!eventId) {
      return c.json({ success: false, error: 'INVALID_INPUT' }, 400);
    }
    const requestData = UpdateEventRequestSchema.parse(await c.req.json());

    if (!validateEventDates(requestData.entry_deadline, requestData.setlist_deadline, requestData.event_date)) {
      return c.json({ success: false, error: 'INVALID_DATE_ORDER' }, 400);
    }

    const now = new Date().toISOString();

    const oldEvent = await c.env.DB.prepare(`
      SELECT group_limit, song_limit FROM events WHERE id = ?
    `).bind(eventId).first<{ group_limit: number; song_limit: number }>();

    if (!oldEvent) {
      return c.json({ success: false, error: 'EVENT_NOT_FOUND' }, 404);
    }

    const oldGroupLimit = oldEvent.group_limit;
    const oldSongLimit = oldEvent.song_limit;
    const songLimit = requestData.song_limit !== undefined ? requestData.song_limit : oldSongLimit;

    if (requestData.group_limit < oldGroupLimit) {
      const violatingMember = await c.env.DB.prepare(`
        SELECT gmi.user_id
        FROM entries entry
        INNER JOIN group_member_instruments gmi ON gmi.group_id = entry.group_id
        WHERE entry.event_id = ?
        GROUP BY gmi.user_id
        HAVING COUNT(DISTINCT entry.group_id) > ?
        LIMIT 1
      `).bind(eventId, requestData.group_limit).first<{ user_id: string }>();
      if (violatingMember) {
        return c.json({ success: false, error: 'GROUP_LIMIT_CONFLICT' }, 409);
      }
    }

    const enforceLoweredLimit = requestData.group_limit < oldGroupLimit ? 1 : 0;
    const updateStatement = c.env.DB.prepare(`
      UPDATE events 
      SET title = ?, event_date = ?, entry_deadline = ?, is_entry_accepting = ?, setlist_deadline = ?, is_setlist_accepting = ?, group_limit = ?, song_limit = ?, updated_at = ?
      WHERE id = ?
        AND (
          ? = 0
          OR NOT EXISTS (
            SELECT 1
            FROM entries entry
            INNER JOIN group_member_instruments gmi ON gmi.group_id = entry.group_id
            WHERE entry.event_id = events.id
            GROUP BY gmi.user_id
            HAVING COUNT(DISTINCT entry.group_id) > ?
          )
        )
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
      eventId,
      enforceLoweredLimit,
      requestData.group_limit
    );
    const statements = [updateStatement];
    if (songLimit < oldSongLimit) {
      statements.push(c.env.DB.prepare(`
        DELETE FROM setlist_items
        WHERE position > ?
          AND entry_id IN (SELECT id FROM entries WHERE event_id = ?)
          AND EXISTS (
            SELECT 1 FROM events ev
            WHERE ev.id = ?
              AND (
                ? = 0
                OR NOT EXISTS (
                  SELECT 1
                  FROM entries entry
                  INNER JOIN group_member_instruments gmi ON gmi.group_id = entry.group_id
                  WHERE entry.event_id = ev.id
                  GROUP BY gmi.user_id
                  HAVING COUNT(DISTINCT entry.group_id) > ?
                )
              )
          )
      `).bind(songLimit, eventId, eventId, enforceLoweredLimit, requestData.group_limit));
    }
    const [updateResult] = await c.env.DB.batch(statements);
    if (Number(updateResult.meta.changes ?? 0) === 0) {
      return enforceLoweredLimit
        ? c.json({ success: false, error: 'GROUP_LIMIT_CONFLICT' }, 409)
        : c.json({ success: false, error: 'EVENT_NOT_FOUND' }, 404);
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

    const eventId = parseUuid(c.req.param('id'));
    if (!eventId) {
      return c.json({ success: false, error: 'INVALID_INPUT' }, 400);
    }

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
