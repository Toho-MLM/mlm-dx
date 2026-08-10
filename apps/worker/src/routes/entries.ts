import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth';
import type { Bindings, Variables } from '../index';
import { z } from 'zod';
import { EntrySchema, CreateEntryRequestSchema, UpdateEntryRequestSchema } from '@shared-schemas';
import { requireAdmin } from '../utils/admin';
import { parseUuid } from '../utils/uuid';
import { validateGroupLimit } from '../features/entries/application/group-limit';
import { createD1EntryRepository } from '../features/entries/infrastructure/d1-repository';

const entriesRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

entriesRoutes.use('*', requireAuth);

entriesRoutes.post('/', async (c) => {
  try {
    const user = c.get('user');
    const requestData = CreateEntryRequestSchema.parse(await c.req.json());

    const isAdminMode = requestData.admin === true;
    const repository = createD1EntryRepository(c.env.DB);

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
      if (!await repository.activeGroupsExist(uniqueRequestedIds)) {
        return c.json({ success: false, error: 'GROUP_NOT_FOUND' }, 404);
      }
      validGroupIds = uniqueRequestedIds;
    } else {
      const userGroupIds = await repository.userGroupIds(user.id);
      validGroupIds = requestData.group_ids.filter(groupId => 
        userGroupIds.includes(groupId)
      );
    }

    if (validGroupIds.length === 0) {
      return c.json({ success: false, error: 'NO_VALID_GROUPS' }, 400);
    }

    const eventRow = await repository.findEventState(requestData.event_id);

    if (!eventRow) {
      return c.json({ success: false, error: 'EVENT_NOT_FOUND' }, 404);
    }

    if (!isAdminMode) {
      if (!eventRow.isEntryAccepting) {
        return c.json({ success: false, error: 'ENTRY_NOT_ACCEPTING' }, 400);
      }
    }

    const validation = await validateGroupLimit(repository, requestData.event_id, validGroupIds);
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

    const existingGroupIds = new Set(await repository.existingGroupIds(requestData.event_id));
    const newGroupIds = [...new Set(validGroupIds)].filter((groupId) => !existingGroupIds.has(groupId));
    if (newGroupIds.length === 0) {
      return c.json({ success: true });
    }

    const now = new Date().toISOString();
    const createdEntryIds = newGroupIds.map(() => crypto.randomUUID());
    await repository.create(requestData.event_id, newGroupIds, createdEntryIds, now);

    if (await repository.hasLimitViolation(requestData.event_id)) {
      await repository.deleteMany(createdEntryIds);
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

    const repository = createD1EntryRepository(c.env.DB);
    const userGroupIds = await repository.userGroupIds(user.id);
    if (!userGroupIds.length) return c.json({ success: true, data: [] });
    const validatedEntries = (await repository.list(userGroupIds, eventId ?? undefined)).map(entry => EntrySchema.parse(entry));

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

    const repository = createD1EntryRepository(c.env.DB);
    const groupId = await repository.findGroupId(entryId);

    if (!groupId) {
      return c.json({ success: false, error: 'ENTRY_NOT_FOUND' }, 404);
    }

    const userGroupIds = await repository.userGroupIds(user.id);

    if (!userGroupIds.includes(groupId)) {
      return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403);
    }

    await repository.delete(entryId);

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

    const repository = createD1EntryRepository(c.env.DB);
    const groupId = await repository.findGroupId(entryId);

    if (!groupId) {
      return c.json({ success: false, error: 'ENTRY_NOT_FOUND' }, 404);
    }

    const userGroupIds = await repository.userGroupIds(user.id);
    if (!userGroupIds.includes(groupId)) {
      return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403);
    }

    await repository.updateNote(entryId, note);

    return c.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ success: false, error: 'INVALID_INPUT' }, 400);
    }
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

export { entriesRoutes };
