import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth';
import type { Bindings, Variables } from '../index';
import { requireAdmin } from '../utils/admin';
import { z } from 'zod';
import { CreateSetlistItemRequestSchema, ReplaceSetlistItemsRequestSchema } from '@shared-schemas';
import { parseUuid } from '../utils/uuid';
import { createD1SetlistRepository } from '../features/setlist/infrastructure/d1-repository';

const setlistRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

setlistRoutes.use('*', requireAuth);

setlistRoutes.post('/', async (c) => {
  try {
    const user = c.get('user');
    const requestData = CreateSetlistItemRequestSchema.parse(await c.req.json());
    const repository = createD1SetlistRepository(c.env.DB);

    const groupId = await repository.findEntryGroupId(requestData.entry_id);

    if (!groupId) {
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
      const userGroupIds = await repository.userGroupIds(user.id);

      if (!userGroupIds.includes(groupId)) {
        return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403);
      }
    }

    const acceptRow = await repository.findEventState(requestData.entry_id);

    if (!acceptRow) {
      return c.json({ success: false, error: 'EVENT_NOT_FOUND' }, 404);
    }

    if (!isAdminMode) {
      if (!acceptRow.isAccepting) {
        return c.json({ success: false, error: 'SETLIST_NOT_ACCEPTING' }, 400);
      }
    }
    if (requestData.position > 0 && requestData.position > acceptRow.songLimit) {
      return c.json({ success: false, error: 'SONG_LIMIT_EXCEEDED' }, 400);
    }

    const now = new Date().toISOString();
    const newId = crypto.randomUUID();

    const created = await repository.createItem({ id: newId, entryId: requestData.entry_id,
      position: requestData.position, title: requestData.title, artist: requestData.artist,
      admin: isAdminMode, now });
    if (!created) {
      const latestAccepting = await repository.isAccepting(requestData.entry_id);
      if (!isAdminMode && latestAccepting === false) {
        return c.json({ success: false, error: 'SETLIST_NOT_ACCEPTING' }, 400);
      }
      return c.json({ success: false, error: 'SONG_LIMIT_EXCEEDED' }, 409);
    }

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
    const eventId = parseUuid(c.req.param('eventId'));
    if (!eventId) {
      return c.json({ success: false, error: 'INVALID_INPUT' }, 400);
    }
    const adminParam = c.req.query('admin');
    const isAdminMode = adminParam === 'true';

    if (isAdminMode) {
      try {
        requireAdmin(user.role);
      } catch (error) {
        return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403);
      }
    }

    const repository = createD1SetlistRepository(c.env.DB);
    await repository.ensureMainBandEntries(eventId, new Date().toISOString(), crypto.randomUUID);
    const groupIds = isAdminMode ? undefined : await repository.userGroupIds(user.id);
    const data = await repository.listEvent(eventId, groupIds);

    return c.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching event setlist bundle:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

setlistRoutes.put('/', async (c) => {
  try {
    const user = c.get('user');
    const entryId = parseUuid(c.req.query('entryId'));

    if (!entryId) {
      return c.json({ success: false, error: 'INVALID_INPUT' }, 400);
    }

    const repository = createD1SetlistRepository(c.env.DB);
    const groupId = await repository.findEntryGroupId(entryId);

    if (!groupId) {
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
      const userGroupIds = await repository.userGroupIds(user.id);
      if (!userGroupIds.includes(groupId)) {
        return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403);
      }
    }

    const now = new Date().toISOString();

    const eventRow = await repository.findEventState(entryId);
    if (!eventRow) {
      return c.json({ success: false, error: 'EVENT_NOT_FOUND' }, 404);
    }
    const songLimit = eventRow.songLimit;

    if (!isAdminMode) {
      if (!eventRow.isAccepting) {
        return c.json({ success: false, error: 'SETLIST_NOT_ACCEPTING' }, 400);
      }
    }
    const songsOnly = reqData.hasSE ? reqData.items.slice(1) : reqData.items;
    if (songsOnly.length > songLimit) {
      return c.json({ success: false, error: 'SONG_LIMIT_EXCEEDED' }, 400);
    }

    await repository.replace(entryId, reqData.note, reqData.hasSE, reqData.items, now, crypto.randomUUID);

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
