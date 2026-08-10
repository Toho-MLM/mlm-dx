import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth';
import type { Bindings, Variables } from '../index';
import { z } from 'zod';
import { getUserGroupIds } from './groups';
import { EntrySchema, CreateEntryRequestSchema, UpdateEntryRequestSchema } from '@shared-schemas';
import { requireAdmin } from '../utils/admin';
import { parseUuid } from '../utils/uuid';

const entriesRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

entriesRoutes.use('*', requireAuth);

async function validateGroupLimit(env: Bindings, eventId: string, groupIds: string[]): Promise<{ isValid: boolean; error?: string; members?: string[] }> {
  const event = await env.DB.prepare(`
    SELECT group_limit FROM events WHERE id = ?
  `).bind(eventId).first<{ group_limit: number }>();

  if (!event) {
    return { isValid: false, error: 'EVENT_NOT_FOUND' };
  }

  const groupLimit = event.group_limit;

  if (groupLimit === 0) {
    return { isValid: true };
  }

  const existingEntries = await env.DB.prepare(`
    SELECT group_id
    FROM entries
    WHERE event_id = ?
  `).bind(eventId).all<{ group_id: string }>();
  const existingGroupIds = new Set(existingEntries.results.map(entry => entry.group_id));
  const newGroupIds = [...new Set(groupIds)].filter(groupId => !existingGroupIds.has(groupId));

  const memberGroupCountMap = new Map<string, number>();

  for (const groupId of newGroupIds) {
    const members = await env.DB.prepare(`
      SELECT DISTINCT user_id
      FROM group_member_instruments
      WHERE group_id = ?
    `).bind(groupId).all<{ user_id: string }>();

    for (const member of members.results) {
      const currentCount = memberGroupCountMap.get(member.user_id) || 0;
      memberGroupCountMap.set(member.user_id, currentCount + 1);
    }
  }

  const exceededMembers: string[] = [];

  for (const [memberId, newEntryCount] of memberGroupCountMap) {
    const existingEntryCount = await env.DB.prepare(`
      SELECT COUNT(DISTINCT e.group_id) as count
      FROM entries e
      WHERE e.event_id = ? AND e.group_id IN (
        SELECT DISTINCT gmi.group_id
        FROM group_member_instruments gmi
        WHERE gmi.user_id = ?
      )
    `).bind(eventId, memberId).first<{ count: number }>();

    const currentCount = existingEntryCount?.count || 0;
    const wouldHaveCount = currentCount + newEntryCount;

    if (wouldHaveCount > groupLimit) {
      const member = await env.DB.prepare(`
        SELECT nickname, name
        FROM users
        WHERE id = ?
      `).bind(memberId).first<{ nickname: string | null; name: string }>();

      const displayName = member ? (member.nickname || member.name) : '不明';
      exceededMembers.push(displayName);
    }
  }

  if (exceededMembers.length > 0) {
    return { 
      isValid: false, 
      error: 'GROUP_LIMIT_EXCEEDED',
      members: exceededMembers
    };
  }

  return { isValid: true };
}

async function hasExistingGroupLimitViolation(env: Bindings, eventId: string): Promise<boolean> {
  const violation = await env.DB.prepare(`
    SELECT gmi.user_id
    FROM entries entry
    INNER JOIN events event ON event.id = entry.event_id
    INNER JOIN group_member_instruments gmi ON gmi.group_id = entry.group_id
    WHERE entry.event_id = ? AND event.group_limit > 0
    GROUP BY gmi.user_id, event.group_limit
    HAVING COUNT(DISTINCT entry.group_id) > event.group_limit
    LIMIT 1
  `).bind(eventId).first();
  return Boolean(violation);
}

entriesRoutes.post('/', async (c) => {
  try {
    const user = c.get('user');
    const requestData = CreateEntryRequestSchema.parse(await c.req.json());

    const isAdminMode = requestData.admin === true;

    if (isAdminMode) {
      try {
        requireAdmin(user.role);
      } catch (error) {
        return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403);
      }
    }

    let validGroupIds: string[];

    if (isAdminMode) {
      const uniqueRequestedIds = [...new Set(requestData.group_ids)];
      if (uniqueRequestedIds.length === 0) {
        return c.json({ success: false, error: 'NO_VALID_GROUPS' }, 400);
      }
      const placeholders = uniqueRequestedIds.map(() => '?').join(',');
      const groups = await c.env.DB.prepare(`
        SELECT id FROM groups WHERE id IN (${placeholders}) AND is_active = TRUE
      `).bind(...uniqueRequestedIds).all<{ id: string }>();
      if (groups.results.length !== uniqueRequestedIds.length) {
        return c.json({ success: false, error: 'GROUP_NOT_FOUND' }, 404);
      }
      validGroupIds = uniqueRequestedIds;
    } else {
      const userGroupIds = await getUserGroupIds(c.env, user.id);
      validGroupIds = requestData.group_ids.filter(groupId => 
        userGroupIds.includes(groupId)
      );
    }

    if (validGroupIds.length === 0) {
      return c.json({ success: false, error: 'NO_VALID_GROUPS' }, 400);
    }

    const eventRow = await c.env.DB.prepare(`
      SELECT is_entry_accepting FROM events WHERE id = ?
    `).bind(requestData.event_id).first<{ is_entry_accepting: number | boolean }>();

    if (!eventRow) {
      return c.json({ success: false, error: 'EVENT_NOT_FOUND' }, 404);
    }

    if (!isAdminMode) {
      const isEntryAccepting = Boolean(eventRow.is_entry_accepting);
      if (!isEntryAccepting) {
        return c.json({ success: false, error: 'ENTRY_NOT_ACCEPTING' }, 400);
      }
    }

    const validation = await validateGroupLimit(c.env, requestData.event_id, validGroupIds);
    if (!validation.isValid) {
      if (validation.members && validation.members.length > 0) {
        return c.json({ 
          success: false, 
          error: validation.error,
          members: validation.members
        }, 400);
      }
      return c.json({ success: false, error: validation.error }, 400);
    }

    const existingEntries = await c.env.DB.prepare(`
      SELECT group_id FROM entries WHERE event_id = ?
    `).bind(requestData.event_id).all<{ group_id: string }>();
    const existingGroupIds = new Set(existingEntries.results.map((entry) => entry.group_id));
    const newGroupIds = [...new Set(validGroupIds)].filter((groupId) => !existingGroupIds.has(groupId));
    if (newGroupIds.length === 0) {
      return c.json({ success: true });
    }

    const now = new Date().toISOString();
    const createdEntryIds = newGroupIds.map(() => crypto.randomUUID());
    await c.env.DB.batch(newGroupIds.map((groupId, index) => c.env.DB.prepare(`
      INSERT OR IGNORE INTO entries (id, event_id, group_id, position, created_at, updated_at)
      SELECT ?, ?, ?, COALESCE(MAX(position), 0) + 1, ?, ?
      FROM entries
      WHERE event_id = ?
    `).bind(
      createdEntryIds[index],
      requestData.event_id,
      groupId,
      now,
      now,
      requestData.event_id
    )));

    if (await hasExistingGroupLimitViolation(c.env, requestData.event_id)) {
      const placeholders = createdEntryIds.map(() => '?').join(',');
      await c.env.DB.prepare(`DELETE FROM entries WHERE id IN (${placeholders})`)
        .bind(...createdEntryIds).run();
      return c.json({ success: false, error: 'GROUP_LIMIT_EXCEEDED' }, 409);
    }

    return c.json({ success: true });
  } catch (error) {
    console.error('Error creating entries:', error);
    if (error instanceof z.ZodError) {
      return c.json({ success: false, error: 'INVALID_INPUT' }, 400);
    }
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

entriesRoutes.get('/', async (c) => {
  try {
    const user = c.get('user');
    const eventIdParam = c.req.query('event_id');
    const eventId = eventIdParam ? parseUuid(eventIdParam) : undefined;
    if (eventIdParam && !eventId) {
      return c.json({ success: false, error: 'INVALID_INPUT' }, 400);
    }

    let query: string;
    let params: string[];

    if (eventId) {
      const userGroupIds = await getUserGroupIds(c.env, user.id);
      
      if (userGroupIds.length === 0) {
        return c.json({ success: true, data: [] });
      }

      query = `
        SELECT e.id, e.event_id, e.group_id, e.note, e.created_at
        FROM entries e
        WHERE e.event_id = ? AND e.group_id IN (${userGroupIds.map(() => '?').join(',')})
        ORDER BY e.created_at DESC
      `;
      params = [eventId, ...userGroupIds];
    } else {
      const userGroupIds = await getUserGroupIds(c.env, user.id);
      
      if (userGroupIds.length === 0) {
        return c.json({ success: true, data: [] });
      }

      query = `
        SELECT e.id, e.event_id, e.group_id, e.note, e.created_at
        FROM entries e
        WHERE e.group_id IN (${userGroupIds.map(() => '?').join(',')})
        ORDER BY e.created_at DESC
      `;
      params = userGroupIds;
    }

    const entries = await c.env.DB.prepare(query).bind(...params).all();
    const validatedEntries = entries.results.map(entry => EntrySchema.parse(entry));

    return c.json({ success: true, data: validatedEntries });
  } catch (error) {
    console.error('Error fetching entries:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

entriesRoutes.delete('/:id', async (c) => {
  try {
    const user = c.get('user');
    const entryId = parseUuid(c.req.param('id'));
    if (!entryId) {
      return c.json({ success: false, error: 'INVALID_INPUT' }, 400);
    }

    const entry = await c.env.DB.prepare(`
      SELECT group_id FROM entries WHERE id = ?
    `).bind(entryId).first<{ group_id: string }>();

    if (!entry) {
      return c.json({ success: false, error: 'ENTRY_NOT_FOUND' }, 404);
    }

    const userGroupIds = await getUserGroupIds(c.env, user.id);

    if (!userGroupIds.includes(entry.group_id)) {
      return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403);
    }

    await c.env.DB.prepare(`
      DELETE FROM entries WHERE id = ?
    `).bind(entryId).run();

    return c.json({ success: true, message: 'Entry deleted successfully' });
  } catch (error) {
    console.error('Error deleting entry:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

entriesRoutes.put('/:id', async (c) => {
  try {
    const user = c.get('user');
    const entryId = parseUuid(c.req.param('id'));
    if (!entryId) {
      return c.json({ success: false, error: 'INVALID_INPUT' }, 400);
    }
    const body = await c.req.json();
    const { note } = UpdateEntryRequestSchema.parse(body);

    const entry = await c.env.DB.prepare(`
      SELECT group_id FROM entries WHERE id = ?
    `).bind(entryId).first<{ group_id: string }>();

    if (!entry) {
      return c.json({ success: false, error: 'ENTRY_NOT_FOUND' }, 404);
    }

    const userGroupIds = await getUserGroupIds(c.env, user.id);
    if (!userGroupIds.includes(entry.group_id)) {
      return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403);
    }

    await c.env.DB.prepare(`
      UPDATE entries SET note = ? WHERE id = ?
    `).bind(note, entryId).run();

    return c.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ success: false, error: 'INVALID_INPUT' }, 400);
    }
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

export { entriesRoutes };
