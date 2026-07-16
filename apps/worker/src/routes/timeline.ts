import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth';
import type { Bindings, Variables } from '../index';
import { z } from 'zod';
import { requireAdmin } from '@shared-schemas';
import { ensureMainBandEntries } from '../utils/main-band-entries';

const UpdateTimelineRequestSchema = z.object({
  items: z.array(z.object({
    entry_id: z.string(),
    position: z.number().int().min(1).nullable(),
    start_time: z.string().datetime().nullable().optional(),
    end_time: z.string().datetime().nullable().optional(),
  }))
});

const timelineRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

timelineRoutes.use('*', requireAuth);

timelineRoutes.get('/event/:eventId', async (c) => {
  try {
    const eventId = c.req.param('eventId');

    const event = await c.env.DB.prepare(`
      SELECT group_limit FROM events WHERE id = ?
    `).bind(eventId).first<{ group_limit: number }>();

    if (!event) {
      return c.json({ success: false, error: 'EVENT_NOT_FOUND' }, 404);
    }

    await ensureMainBandEntries(c.env, eventId);

    type TimelineRow = {
      entry_id: string;
      group_id: string;
      start_time: string | null;
      end_time: string | null;
      position: number | null;
      created_at: string;
      group_name: string | null;
    };

    const rows = await c.env.DB.prepare(`
      SELECT 
        e.id as entry_id,
        e.group_id,
        e.start_time,
        e.end_time,
        e.position,
        e.created_at,
        g.name as group_name
      FROM entries e
      LEFT JOIN groups g ON g.id = e.group_id
      WHERE e.event_id = ?
      ORDER BY e.position IS NULL, e.position ASC, e.created_at ASC
    `).bind(eventId).all<TimelineRow>();

    type TimelineItem = {
      entry_id: string;
      group_id: string;
      group_name: string | null;
      start_time: string | null;
      end_time: string | null;
      position: number | null;
      created_at: string;
    };

    const configured: TimelineItem[] = [];
    const unconfigured: TimelineItem[] = [];

    for (const r of rows.results) {
      const item = {
        entry_id: r.entry_id,
        group_id: r.group_id,
        group_name: r.group_name || '不明なグループ',
        start_time: r.start_time || null,
        end_time: r.end_time || null,
        position: r.position === null ? null : Number(r.position),
        created_at: r.created_at,
      };
      if (item.position === null) unconfigured.push(item); else configured.push(item);
    }

    return c.json({ success: true, data: { configured, unconfigured } });
  } catch (error) {
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

timelineRoutes.put('/event/:eventId', async (c) => {
  try {
    const user = c.get('user');
    try { requireAdmin(user.role); } catch { return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403); }

    const eventId = c.req.param('eventId');
    const body = UpdateTimelineRequestSchema.parse(await c.req.json());

    const items = body.items;

    const posItems = items.filter(i => i.position !== null) as Array<{ entry_id: string; position: number; start_time?: string | null; end_time?: string | null }>;

    const posSet = new Set<number>();
    for (const it of posItems) {
      if (posSet.has(it.position)) {
        return c.json({ success: false, error: 'DUPLICATE_POSITION' }, 400);
      }
      posSet.add(it.position);
      if (it.start_time && it.end_time) {
        if (new Date(it.start_time) >= new Date(it.end_time)) {
          return c.json({ success: false, error: 'INVALID_TIME_RANGE' }, 400);
        }
      }
    }

    const sorted = [...posSet].sort((a, b) => a - b);
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i] !== i + 1) {
        return c.json({ success: false, error: 'INVALID_POSITION_SEQUENCE' }, 400);
      }
    }

    const now = new Date().toISOString();

    for (const it of items) {
      const row = await c.env.DB.prepare(`
        SELECT id FROM entries WHERE id = ? AND event_id = ?
      `).bind(it.entry_id, eventId).first();
      if (!row) {
        return c.json({ success: false, error: 'ENTRY_NOT_FOUND' }, 404);
      }
    }

    for (const it of items) {
      await c.env.DB.prepare(`
        UPDATE entries SET position = ?, start_time = ?, end_time = ?, updated_at = ? WHERE id = ?
      `).bind(
        it.position,
        it.start_time ?? null,
        it.end_time ?? null,
        now,
        it.entry_id
      ).run();
    }

    return c.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ success: false, error: 'INVALID_INPUT' }, 400);
    }
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

export { timelineRoutes };
