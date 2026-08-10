import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth';
import type { Bindings, Variables } from '../index';
import { requireAdmin } from '../utils/admin';
import { z } from 'zod';
import { EventSchema, CreateEventRequestSchema, UpdateEventRequestSchema } from '@shared-schemas';
import { parseUuid } from '../utils/uuid';
import { validateEventDates } from '../features/events/domain/dates';
import { createD1EventRepository } from '../features/events/infrastructure/d1-repository';

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
    
    await createD1EventRepository(c.env.DB).create({
      id: newId, title: requestData.title, eventDate: requestData.event_date,
      entryDeadline: requestData.entry_deadline, isEntryAccepting: requestData.is_entry_accepting,
      setlistDeadline: requestData.setlist_deadline, isSetlistAccepting: requestData.is_setlist_accepting,
      groupLimit: requestData.group_limit, songLimit,
    }, now);
    
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
    const events = await createD1EventRepository(c.env.DB).list();
    const validatedEvents = events.map(event => EventSchema.parse(event));

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

    const repository = createD1EventRepository(c.env.DB);
    const oldEvent = await repository.findLimits(eventId);

    if (!oldEvent) {
      return c.json({ success: false, error: 'EVENT_NOT_FOUND' }, 404);
    }

    const oldGroupLimit = oldEvent.groupLimit;
    const oldSongLimit = oldEvent.songLimit;
    const songLimit = requestData.song_limit !== undefined ? requestData.song_limit : oldSongLimit;

    if (requestData.group_limit < oldGroupLimit) {
      if (await repository.hasGroupLimitViolation(eventId, requestData.group_limit)) {
        return c.json({ success: false, error: 'GROUP_LIMIT_CONFLICT' }, 409);
      }
    }

    const updated = await repository.update({
      id: eventId, title: requestData.title, eventDate: requestData.event_date,
      entryDeadline: requestData.entry_deadline, isEntryAccepting: requestData.is_entry_accepting,
      setlistDeadline: requestData.setlist_deadline, isSetlistAccepting: requestData.is_setlist_accepting,
      groupLimit: requestData.group_limit, songLimit,
    }, oldEvent, now);
    if (!updated) {
      return requestData.group_limit < oldGroupLimit
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

    await createD1EventRepository(c.env.DB).delete(eventId);

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
