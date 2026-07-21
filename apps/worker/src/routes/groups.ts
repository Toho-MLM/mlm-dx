import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth';
import type { Bindings, Variables } from '../index';
import { GroupSchema, CreateGroupRequestSchema, UpdateGroupRequestSchema, DeleteGroupsRequestSchema, type Group } from '../schemas';
import { requireAdmin } from '../utils/admin';
import { ZodError } from 'zod';
import { parseUuid } from '../utils/uuid';

const groupRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

type GroupIdRow = Pick<Group, 'id'>;
type GroupAssignmentRow = {
  instrument: string;
  user_id: string;
};

function normalizeAssignments(assignmentsInput: unknown): Record<string, string[]> | null {
  const rawAssignments = typeof assignmentsInput === 'string'
    ? JSON.parse(assignmentsInput)
    : assignmentsInput;

  if (!rawAssignments || typeof rawAssignments !== 'object' || Array.isArray(rawAssignments)) {
    return null;
  }

  const normalizedAssignments: Record<string, string[]> = {};

  for (const [instrument, memberUserIds] of Object.entries(rawAssignments)) {
    if (Array.isArray(memberUserIds)) {
      const parsedMemberUserIds = memberUserIds.map(parseUuid);
      if (parsedMemberUserIds.some(memberUserId => memberUserId === null)) {
        return null;
      }
      normalizedAssignments[instrument] = parsedMemberUserIds as string[];
      continue;
    }

    const parsedMemberUserId = parseUuid(memberUserIds);
    if (parsedMemberUserId) {
      normalizedAssignments[instrument] = [parsedMemberUserId];
      continue;
    }

    return null;
  }

  return normalizedAssignments;
}

export async function isUserInGroup(env: Bindings, userId: string, groupId: string): Promise<boolean> {
  const result = await env.DB.prepare(`
    SELECT 1
    FROM groups g
    JOIN group_member_instruments gmi ON g.id = gmi.group_id
    WHERE gmi.user_id = ? AND g.id = ? AND g.is_active = TRUE
    LIMIT 1
  `).bind(userId, groupId).first();
  
  return !!result;
}

export async function getUserGroupIds(env: Bindings, userId: string): Promise<string[]> {
  const userGroups = await env.DB.prepare(`
    SELECT DISTINCT g.id
    FROM groups g
    JOIN group_member_instruments gmi ON g.id = gmi.group_id
    WHERE gmi.user_id = ? AND g.is_active = TRUE
  `).bind(userId).all<GroupIdRow>();
  
  return userGroups.results.map((group) => group.id);
}

groupRoutes.use('*', requireAuth);

groupRoutes.post('/', async (c) => {
  try {
    const requestData = CreateGroupRequestSchema.parse(await c.req.json());

    const now = new Date().toISOString();
    const newId = crypto.randomUUID();
    
    await c.env.DB.prepare(`
      INSERT INTO groups (id, name, is_main, is_active, created_at, updated_at)
      VALUES (?, ?, ?, TRUE, ?, ?)
    `).bind(newId, requestData.name, requestData.is_main, now, now).run();
    
    if (requestData.assignments) {
      let assignments: Record<string, string[]> | null;
      try {
        assignments = normalizeAssignments(requestData.assignments);
      } catch (parseError) {
        return c.json({
          success: false,
          error: 'INVALID_ASSIGNMENTS_FORMAT'
        }, 400);
      }

      if (!assignments) {
        return c.json({
          success: false,
          error: 'INVALID_ASSIGNMENTS_FORMAT'
        }, 400);
      }

      for (const [instrument, memberUserIds] of Object.entries(assignments)) {
        for (const memberUserId of memberUserIds) {
          await c.env.DB.prepare(`
            INSERT INTO group_member_instruments (id, group_id, user_id, instrument, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
          `).bind(crypto.randomUUID(), newId, memberUserId, instrument, now, now).run();
        }
      }
    }
    
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
    
    let query: string;
    let params: string[];
    
    if (isMainOnly) {
      query = `
        SELECT DISTINCT g.*
        FROM groups g
        WHERE g.is_main = TRUE AND g.is_active = TRUE
        ORDER BY g.created_at DESC, g.id DESC
      `;
      params = [];
    } else if (isAdminMode) {
      query = `
        SELECT DISTINCT g.*
        FROM groups g
        ORDER BY g.created_at DESC, g.id DESC
      `;
      params = [];
    } else {
      query = `
        SELECT DISTINCT g.*
        FROM groups g
        JOIN group_member_instruments gmi ON g.id = gmi.group_id
        WHERE gmi.user_id = ?
        ORDER BY g.created_at DESC, g.id DESC
      `;
      params = [userId];
    }
    
    const groups = await c.env.DB.prepare(query).bind(...params).all<Group>();

    const groupsWithAssignments = await Promise.all(
      groups.results.map(async (group) => {
        const assignments = await c.env.DB.prepare(`
          SELECT instrument, user_id
          FROM group_member_instruments
          WHERE group_id = ?
        `).bind(group.id).all<GroupAssignmentRow>();

        const memberMap: Record<string, string[]> = {};
        assignments.results.forEach((assignment) => {
          if (!memberMap[assignment.user_id]) {
            memberMap[assignment.user_id] = [];
          }
          memberMap[assignment.user_id].push(assignment.instrument);
        });

        const groupMembers = Object.entries(memberMap).map(([userId, instruments]) => ({
          id: userId,
          instruments: instruments
        }));

        return {
          ...group,
          assignments: groupMembers
        };
      })
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
    const groupId = parseUuid(c.req.param('id'));
    if (!groupId) {
      return c.json({ success: false, error: 'INVALID_INPUT' }, 400);
    }
    const requestData = UpdateGroupRequestSchema.parse(await c.req.json());

    const now = new Date().toISOString();

    await c.env.DB.prepare(`
      UPDATE groups 
      SET name = ?, is_main = ?, is_active = ?, updated_at = ?
      WHERE id = ?
    `).bind(requestData.name, requestData.is_main, requestData.is_active, now, groupId).run();

    if (requestData.assignments) {
      let assignments: Record<string, string[]> | null;
      try {
        assignments = normalizeAssignments(requestData.assignments);
      } catch (parseError) {
        return c.json({
          success: false,
          error: 'INVALID_ASSIGNMENTS_FORMAT'
        }, 400);
      }

      if (!assignments) {
        return c.json({
          success: false,
          error: 'INVALID_ASSIGNMENTS_FORMAT'
        }, 400);
      }

      await c.env.DB.prepare(`
        DELETE FROM group_member_instruments WHERE group_id = ?
      `).bind(groupId).run();

      for (const [instrument, memberUserIds] of Object.entries(assignments)) {
        for (const memberUserId of memberUserIds) {
          await c.env.DB.prepare(`
            INSERT INTO group_member_instruments (id, group_id, user_id, instrument, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
          `).bind(crypto.randomUUID(), groupId, memberUserId, instrument, now, now).run();
        }
      }
    }

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
    const placeholders = uniqueIds.map(() => '?').join(',');
    const existingGroups = await c.env.DB.prepare(`
      SELECT id FROM groups WHERE id IN (${placeholders})
    `).bind(...uniqueIds).all<GroupIdRow>();

    if (existingGroups.results.length !== uniqueIds.length) {
      return c.json({ success: false, error: 'GROUP_NOT_FOUND' }, 404);
    }

    await c.env.DB.batch([
      c.env.DB.prepare(`
        DELETE FROM setlist_items
        WHERE entry_id IN (SELECT id FROM entries WHERE group_id IN (${placeholders}))
      `).bind(...uniqueIds),
      c.env.DB.prepare(`DELETE FROM entries WHERE group_id IN (${placeholders})`).bind(...uniqueIds),
      c.env.DB.prepare(`DELETE FROM external_reservations WHERE group_id IN (${placeholders})`).bind(...uniqueIds),
      c.env.DB.prepare(`DELETE FROM reservations WHERE group_id IN (${placeholders})`).bind(...uniqueIds),
      c.env.DB.prepare(`DELETE FROM group_member_instruments WHERE group_id IN (${placeholders})`).bind(...uniqueIds),
      c.env.DB.prepare(`DELETE FROM groups WHERE id IN (${placeholders})`).bind(...uniqueIds),
    ]);

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
    const group = await c.env.DB.prepare(`
      SELECT id FROM groups WHERE id = ?
    `).bind(groupId).first<GroupIdRow>();

    if (!group) {
      return c.json({ success: false, error: 'GROUP_NOT_FOUND' }, 404);
    }

    // D1 の外部キー設定に依存せず、バンドに紐づくデータを完全に削除する。
    await c.env.DB.batch([
      c.env.DB.prepare(`
        DELETE FROM setlist_items
        WHERE entry_id IN (SELECT id FROM entries WHERE group_id = ?)
      `).bind(groupId),
      c.env.DB.prepare('DELETE FROM entries WHERE group_id = ?').bind(groupId),
      c.env.DB.prepare('DELETE FROM external_reservations WHERE group_id = ?').bind(groupId),
      c.env.DB.prepare('DELETE FROM reservations WHERE group_id = ?').bind(groupId),
      c.env.DB.prepare('DELETE FROM group_member_instruments WHERE group_id = ?').bind(groupId),
      c.env.DB.prepare('DELETE FROM groups WHERE id = ?').bind(groupId),
    ]);

    return c.json({ success: true });
  } catch (error) {
    console.error('Error deleting group:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});


export { groupRoutes };
