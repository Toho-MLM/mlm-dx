import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth';
import type { Bindings, Variables } from '../index';
import { z } from 'zod';
import { requireAdmin } from '@shared-schemas';
import { parseUuid } from '../utils/uuid';
import { validateTimeline } from '../features/timeline/domain/timeline';
import { createD1TimelineRepository } from '../features/timeline/infrastructure/d1-repository';

const UuidSchema = z.string().uuid();

const UpdateTimelineRequestSchema = z.object({
  items: z.array(z.object({
    entry_id: UuidSchema,
    position: z.number().int().min(1).nullable(),
    start_time: z.string().datetime().nullable().optional(),
    end_time: z.string().datetime().nullable().optional(),
  }))
});

const timelineRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

timelineRoutes.use('*', requireAuth);

timelineRoutes.get('/event/:eventId', async (c) => {
  try {
    const eventId = parseUuid(c.req.param('eventId'));
    if (!eventId) {
      return c.json({ success: false, error: 'INVALID_INPUT' }, 400);
    }

    const repository = createD1TimelineRepository(c.env.DB);
    if (!await repository.eventExists(eventId)) {
      return c.json({ success: false, error: 'EVENT_NOT_FOUND' }, 404);
    }

    await repository.ensureMainBandEntries(eventId, new Date().toISOString(), crypto.randomUUID);
    return c.json({ success: true, data: await repository.list(eventId) });
  } catch (error) {
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

timelineRoutes.put('/event/:eventId', async (c) => {
  try {
    const user = c.get('user');
    try { requireAdmin(user.role); } catch { return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403); }

    const eventId = parseUuid(c.req.param('eventId'));
    if (!eventId) {
      return c.json({ success: false, error: 'INVALID_INPUT' }, 400);
    }
    const body = UpdateTimelineRequestSchema.parse(await c.req.json());

    const items = body.items.map((item) => ({
      entryId: item.entry_id,
      position: item.position,
      startTime: item.start_time,
      endTime: item.end_time,
    }));
    const validationError = validateTimeline(items);
    if (validationError) return c.json({ success: false, error: validationError }, 400);

    const now = new Date().toISOString();
    const repository = createD1TimelineRepository(c.env.DB);
    if (!await repository.entriesBelongToEvent(eventId, items.map((item) => item.entryId))) {
      return c.json({ success: false, error: 'ENTRY_NOT_FOUND' }, 404);
    }
    await repository.update(items, now);

    return c.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ success: false, error: 'INVALID_INPUT' }, 400);
    }
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

export { timelineRoutes };
