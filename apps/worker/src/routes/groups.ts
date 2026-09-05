import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth';
import type { Bindings, Variables } from '../index';
import { GroupSchema, CreateGroupRequestSchema, UpdateGroupRequestSchema, DeleteGroupsRequestSchema } from '../schemas';
import { isAdmin, requireAdmin } from '../utils/admin';
import { ZodError } from 'zod';
import { parseUuid } from '../utils/uuid';
import { assignmentMemberIds, normalizeAssignments } from '../features/groups/domain/assignments';
import { canMemberUpdateGroup } from '../features/groups/domain/update-permissions';
import { createD1GroupRepository } from '../features/groups/infrastructure/d1-repository';

const groupRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

async function validateAssignments(
  env: Bindings,
  assignmentsInput: unknown,
  options: { requiredUserId?: string; minimumMembers?: number } = {}
): Promise<Record<string, string[]> | null> {
  const assignments = normalizeAssignments(assignmentsInput);
  if (!assignments) return null;

  const memberIds = assignmentMemberIds(assignments);
  if (memberIds.length < (options.minimumMembers ?? 0)) return null;
  if (options.requiredUserId && !memberIds.includes(options.requiredUserId)) return null;
  if (memberIds.length === 0) return assignments;

  return await createD1GroupRepository(env.DB).usersExist(memberIds) ? assignments : null;
}

export async function isUserInGroup(env: Bindings, userId: string, groupId: string): Promise<boolean> {
  return createD1GroupRepository(env.DB).isUserInGroup(userId, groupId);
}

export async function getUserGroupIds(env: Bindings, userId: string): Promise<string[]> {
  return createD1GroupRepository(env.DB).getUserGroupIds(userId);
}

groupRoutes.use('*', requireAuth);

groupRoutes.post('/', async (c) => {
  try {
    const user = c.get('user');
    const requestData = CreateGroupRequestSchema.parse(await c.req.json());

    if (requestData.is_main && !isAdmin(user.role)) {
      return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403);
    }

    if (!requestData.assignments) {
      return c.json({ success: false, error: 'INVALID_ASSIGNMENTS_FORMAT' }, 400);
    }
    const assignments = await validateAssignments(c.env, requestData.assignments, {
      requiredUserId: isAdmin(user.role) ? undefined : user.id,
      minimumMembers: 2,
    });
    if (!assignments) {
      return c.json({ success: false, error: 'INVALID_ASSIGNMENTS_FORMAT' }, 400);
    }

    const now = new Date().toISOString();
    const newId = crypto.randomUUID();

    await createD1GroupRepository(c.env.DB).create(
      newId, requestData.name, requestData.is_main, assignments, now, () => crypto.randomUUID(),
    );
    
    return c.json({ success: true });
  } catch (error) {
    if (error instanceof ZodError) {
      return c.json({ success: false, error: 'INVALID_INPUT' }, 400);
    }
    console.error('Error creating group:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

groupRoutes.get('/', async (c) => {
  try {
    const user = c.get('user');
    const userId = user.id;
    
    const adminParam = c.req.query('admin');
    const isAdminMode = adminParam === 'true';
    const mainParam = c.req.query('main');
    const isMainOnly = mainParam === 'true';
    
    if (isAdminMode) {
      try {
        requireAdmin(user.role);
      } catch (error) {
        return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403);
      }
    }
    
    const groupsWithAssignments = await createD1GroupRepository(c.env.DB).list(
      userId, isMainOnly ? 'main' : isAdminMode ? 'admin' : 'member',
    );

    const validatedGroups = groupsWithAssignments.map(group => GroupSchema.parse(group));

    return c.json({ success: true, data: validatedGroups });
  } catch (error) {
    console.error('Error fetching user groups:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});


groupRoutes.put('/:id', async (c) => {
  try {
    const user = c.get('user');
    const groupId = parseUuid(c.req.param('id'));
    if (!groupId) {
      return c.json({ success: false, error: 'INVALID_INPUT' }, 400);
    }
    const requestData = UpdateGroupRequestSchema.parse(await c.req.json());

    const repository = createD1GroupRepository(c.env.DB);
    const currentGroup = await repository.findState(groupId);
    if (!currentGroup) {
      return c.json({ success: false, error: 'GROUP_NOT_FOUND' }, 404);
    }

    const userIsAdmin = isAdmin(user.role);
    if (!userIsAdmin) {
      const isMember = await isUserInGroup(c.env, user.id, groupId);
      if (!isMember || !canMemberUpdateGroup(currentGroup, {
        isMain: requestData.is_main,
        isActive: requestData.is_active,
        includesAssignments: requestData.assignments !== undefined,
      })) {
        return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403);
      }
    }

    const assignments = requestData.assignments === undefined
      ? undefined
      : await validateAssignments(c.env, requestData.assignments, {
          requiredUserId: userIsAdmin ? undefined : user.id,
          minimumMembers: 2,
        });
    if (requestData.assignments !== undefined && !assignments) {
      return c.json({ success: false, error: 'INVALID_ASSIGNMENTS_FORMAT' }, 400);
    }

    const now = new Date().toISOString();

    await repository.update(
      groupId, requestData.name, requestData.is_main, requestData.is_active, assignments ?? undefined, now, () => crypto.randomUUID(),
    );

    return c.json({ success: true });
  } catch (error) {
    if (error instanceof ZodError) {
      return c.json({ success: false, error: 'INVALID_INPUT' }, 400);
    }
    console.error('Error updating group:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

groupRoutes.delete('/', async (c) => {
  try {
    try {
      requireAdmin(c.get('user').role);
    } catch {
      return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403);
    }

    const { ids } = DeleteGroupsRequestSchema.parse(await c.req.json());
    const uniqueIds = [...new Set(ids)];
    const repository = createD1GroupRepository(c.env.DB);
    if (!await repository.allExist(uniqueIds)) {
      return c.json({ success: false, error: 'GROUP_NOT_FOUND' }, 404);
    }

    await repository.delete(uniqueIds);

    return c.json({ success: true });
  } catch (error) {
    if (error instanceof ZodError) {
      return c.json({ success: false, error: 'INVALID_REQUEST' }, 400);
    }
    console.error('Error deleting groups:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

groupRoutes.delete('/:id', async (c) => {
  try {
    try {
      requireAdmin(c.get('user').role);
    } catch {
      return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403);
    }

    const groupId = parseUuid(c.req.param('id'));
    if (!groupId) {
      return c.json({ success: false, error: 'INVALID_INPUT' }, 400);
    }
    const repository = createD1GroupRepository(c.env.DB);
    if (!await repository.allExist([groupId])) {
      return c.json({ success: false, error: 'GROUP_NOT_FOUND' }, 404);
    }

    await repository.delete([groupId]);

    return c.json({ success: true });
  } catch (error) {
    console.error('Error deleting group:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});


export { groupRoutes };
