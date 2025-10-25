import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth';
import type { Bindings, Variables } from '../index';
import { GroupSchema, CreateGroupRequestSchema, UpdateGroupRequestSchema } from '../schemas';
import { isAdmin, requireAdmin } from '../utils/admin';
import { z } from 'zod';

const groupRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Helper function to check if a user belongs to a specific group
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

// Helper function to get user's group IDs
export async function getUserGroupIds(env: Bindings, userId: string): Promise<string[]> {
  const userGroups = await env.DB.prepare(`
    SELECT DISTINCT g.id
    FROM groups g
    JOIN group_member_instruments gmi ON g.id = gmi.group_id
    WHERE gmi.user_id = ? AND g.is_active = TRUE
  `).bind(userId).all();
  
  return userGroups.results.map((group: any) => group.id);
}

// Apply authentication middleware to all routes
groupRoutes.use('*', requireAuth);

// create_group - Create a new group
groupRoutes.post('/', async (c) => {
  try {
    const requestData = z.object({
      name: z.string().min(1),
      assignments: z.string().optional(),
      is_main: z.boolean().optional(),
    }).parse(await c.req.json());

    const now = new Date().toISOString();
    const newId = crypto.randomUUID();
    
    await c.env.DB.prepare(`
      INSERT INTO groups (id, name, is_main, is_active, created_at, updated_at)
      VALUES (?, ?, ?, TRUE, ?, ?)
    `).bind(newId, requestData.name, requestData.is_main, now, now).run();
    
    // メンバーを追加
    if (requestData.assignments) {
      try {
        const assignments = JSON.parse(requestData.assignments);
        for (const [instrument, memberUserId] of Object.entries(assignments)) {
          await c.env.DB.prepare(`
            INSERT INTO group_member_instruments (id, group_id, user_id, instrument, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
          `).bind(crypto.randomUUID(), newId, memberUserId, instrument, now, now).run();
        }
      } catch (parseError) {
        console.error('Error parsing assignments:', parseError);
      }
    }
    
    return c.json({ 
      success: true, 
      message: 'Group created successfully',
      data: { id: newId }
    });
  } catch (error) {
    console.error('Error creating group:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

// Get user's groups (both active and inactive groups that user belongs to)
groupRoutes.get('/', async (c) => {
  try {
    const user = c.get('user');
    const userId = user.id;
    
    // Check for admin parameter
    const adminParam = c.req.query('admin');
    const isAdminMode = adminParam === 'true';
    
    // If admin mode is requested, verify admin permissions
    if (isAdminMode) {
      try {
        requireAdmin(user.role);
      } catch (error) {
        return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403);
      }
    }
    
    let query: string;
    let params: any[];
    
    if (isAdminMode) {
      // Admin mode: get all groups
      query = `
        SELECT DISTINCT g.*
        FROM groups g
        ORDER BY g.is_active DESC, g.is_main DESC, g.created_at DESC
      `;
      params = [];
    } else {
      // Normal mode: get only user's groups
      query = `
        SELECT DISTINCT g.*
        FROM groups g
        JOIN group_member_instruments gmi ON g.id = gmi.group_id
        WHERE gmi.user_id = ?
        ORDER BY g.is_active DESC, g.is_main DESC, g.created_at DESC
      `;
      params = [userId];
    }
    
    const groups = await c.env.DB.prepare(query).bind(...params).all();

    // Get assignments for each group
    const groupsWithAssignments = await Promise.all(
      groups.results.map(async (group: any) => {
        const assignments = await c.env.DB.prepare(`
          SELECT instrument, user_id
          FROM group_member_instruments
          WHERE group_id = ?
        `).bind(group.id).all();

        // Convert assignments to GroupMember[] format
        const memberMap: Record<string, string[]> = {};
        assignments.results.forEach((assignment: any) => {
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

// Get group options for reservation dialog (id and name only)
groupRoutes.get('/options', async (c) => {
  try {
    const user = c.get('user');
    const userId = user.id;
    
    const groups = await c.env.DB.prepare(`
      SELECT DISTINCT g.id, g.name
      FROM groups g
      JOIN group_member_instruments gmi ON g.id = gmi.group_id
      WHERE gmi.user_id = ? AND g.is_active = TRUE
      ORDER BY g.is_main DESC, g.created_at DESC
    `).bind(userId).all();

    return c.json({ success: true, data: groups.results });
  } catch (error) {
    console.error('Error fetching group options:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

// Get member options for band management (id, name, instruments)
groupRoutes.get('/member-options', async (c) => {
  try {
    const members = await c.env.DB.prepare(`
      SELECT 
        u.id,
        u.name,
        u.nickname,
        u.instruments
      FROM users u
      WHERE u.name IS NOT NULL
      ORDER BY u.name ASC
    `).all();

    // Process the results to format name and instruments
    const processedMembers = members.results.map((member: any) => {
      const displayName = member.nickname || member.name;
      const instruments = JSON.parse(member.instruments || '[]');
      
      return {
        id: member.id,
        name: displayName,
        instruments: instruments
      };
    });

    return c.json({ success: true, data: processedMembers });
  } catch (error) {
    console.error('Error fetching member options:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

// Update group
groupRoutes.put('/:id', async (c) => {
  try {
    const groupId = c.req.param('id');
    const requestData = UpdateGroupRequestSchema.parse(await c.req.json());

    const now = new Date().toISOString();

    // グループ情報を更新
    await c.env.DB.prepare(`
      UPDATE groups 
      SET name = ?, is_main = ?, is_active = ?, updated_at = ?
      WHERE id = ?
    `).bind(requestData.name, requestData.is_main, requestData.is_active, now, groupId).run();

    // assignmentsが提供されている場合、メンバー情報を更新
    if (requestData.assignments) {
      try {
        // 既存のメンバー情報を削除
        await c.env.DB.prepare(`
          DELETE FROM group_member_instruments WHERE group_id = ?
        `).bind(groupId).run();

        // 新しいメンバー情報を追加
        const assignments = JSON.parse(requestData.assignments);
        for (const [instrument, memberUserId] of Object.entries(assignments)) {
          await c.env.DB.prepare(`
            INSERT INTO group_member_instruments (id, group_id, user_id, instrument, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
          `).bind(crypto.randomUUID(), groupId, memberUserId, instrument, now, now).run();
        }
      } catch (parseError) {
        console.error('Error parsing assignments:', parseError);
      }
    }

    return c.json({ success: true, message: 'Group updated successfully' });
  } catch (error) {
    console.error('Error updating group:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});


export { groupRoutes };
