import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth';
import type { Bindings, Variables } from '../index';
import { generateStudentNumber } from '../utils/student';

const userRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Apply authentication middleware to all routes
userRoutes.use('*', requireAuth);

// me - Get current user data
userRoutes.get('/me', async (c) => {
  try {
    const user = c.get('user');
    
    // Parse instruments JSON string
    let parsedInstruments: string[] = [];
    try {
      parsedInstruments = JSON.parse((user as any).instruments || '[]') as string[];
    } catch (error) {
      console.error('Error parsing instruments:', error);
      parsedInstruments = [];
    }

    const userWithParsedInstruments = {
      ...user,
      instruments: parsedInstruments
    };

    return c.json({ success: true, data: userWithParsedInstruments });
  } catch (error) {
    console.error('Error fetching current user:', error);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// fetch_user - Get user data by email
userRoutes.get('/fetch/:email', async (c) => {
  try {
    const email = c.req.param('email');
    
    const user = await c.env.DB.prepare(
      'SELECT * FROM users WHERE email = ?'
    ).bind(email).first() as any;

    if (!user) {
      return c.json({ success: false, error: 'User not found' }, 404);
    }

    // Parse instruments JSON string
    let parsedInstruments: string[] = [];
    try {
      parsedInstruments = JSON.parse((user as any).instruments || '[]') as string[];
    } catch (error) {
      console.error('Error parsing instruments:', error);
      parsedInstruments = [];
    }

    // Add student_number as computed field
    const userWithStudentNumber = {
      ...user,
      instruments: parsedInstruments,
      student_number: generateStudentNumber(user.email)
    };

    return c.json({ success: true, data: userWithStudentNumber });
  } catch (error) {
    console.error('Error fetching user:', error);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// update_user - Update user data
userRoutes.put('/update', async (c) => {
  try {
    const user = c.get('user');
    const { nickname, instruments } = await c.req.json();

    const now = new Date().toISOString();
    const instrumentsJson = JSON.stringify(instruments);

    await c.env.DB.prepare(
      'UPDATE users SET nickname = ?, instruments = ?, updated_at = ? WHERE email = ?'
    ).bind(nickname, instrumentsJson, now, user.email).run();

    return c.json({ success: true, message: 'User updated successfully' });
  } catch (error) {
    console.error('Error updating user:', error);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// fetch_user_groups - Get user's groups
userRoutes.get('/groups', async (c) => {
  try {
    const user = c.get('user');

    const groups = await c.env.DB.prepare(`
      SELECT g.*, gm.role as member_role
      FROM groups g
      JOIN group_members gm ON g.id = gm.group_id
      WHERE gm.user_id = ? AND g.is_active = TRUE
    `).bind(user.id).all();

    return c.json({ success: true, data: groups.results });
  } catch (error) {
    console.error('Error fetching user groups:', error);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// fetch_user_holder - Get user data with groups for reservation holder
userRoutes.get('/holder', async (c) => {
  try {
    const user = c.get('user');

    // Get user data
    const userData = await c.env.DB.prepare(
      'SELECT * FROM users WHERE id = ?'
    ).bind(user.id).first() as any;

    if (!userData) {
      return c.json({ success: false, error: 'User not found' }, 404);
    }

    // Get user's groups
    const groups = await c.env.DB.prepare(`
      SELECT g.*, gm.role as member_role
      FROM groups g
      JOIN group_members gm ON g.id = gm.group_id
      WHERE gm.user_id = ? AND g.is_active = TRUE
    `).bind(user.id).all();

    // Parse instruments JSON string
    let parsedInstruments: string[] = [];
    try {
      parsedInstruments = JSON.parse((userData as any).instruments || '[]') as string[];
    } catch (error) {
      console.error('Error parsing instruments:', error);
      parsedInstruments = [];
    }

    // Add student_number as computed field
    const userWithStudentNumber = {
      ...userData,
      instruments: parsedInstruments,
      student_number: generateStudentNumber(userData.email)
    };

    return c.json({
      success: true,
      data: {
        user: userWithStudentNumber,
        bands: groups.results
      }
    });
  } catch (error) {
    console.error('Error fetching user holder:', error);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { userRoutes };
