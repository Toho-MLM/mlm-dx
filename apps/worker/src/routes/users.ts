import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth';
import type { Bindings, Variables } from '../index';
import { generateStudentNumber } from '../utils/student';
import { UserSchema, UserWithInstrumentsSchema, UpdateUserRequestSchema } from '../schemas';
import { z } from 'zod';

const userRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Apply authentication middleware to all routes
userRoutes.use('*', requireAuth);

// me - Get current user data
userRoutes.get('/me', async (c) => {
  try {
    const user = UserSchema.parse(c.get('user'));

    const userWithParsedInstruments = UserWithInstrumentsSchema.parse({
      ...user,
      student_number: generateStudentNumber(user.email)
    });

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
    
    const dbUser = await c.env.DB.prepare(
      'SELECT * FROM users WHERE email = ?'
    ).bind(email).first();

    if (!dbUser) {
      return c.json({ success: false, error: 'User not found' }, 404);
    }

    let parsedInstruments: string[] = [];
    try {
      parsedInstruments = JSON.parse(String(dbUser.instruments || '[]')) as string[];
    } catch (error) {
      console.error('Error parsing instruments:', error);
      parsedInstruments = [];
    }

    const user = UserSchema.parse({
      ...dbUser,
      instruments: parsedInstruments,
      grade: Number(dbUser.grade),
    });

    const userWithStudentNumber = UserWithInstrumentsSchema.parse({
      ...user,
      student_number: generateStudentNumber(user.email)
    });

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
    const requestData = UpdateUserRequestSchema.parse(await c.req.json());

    const now = new Date().toISOString();
    const instrumentsJson = JSON.stringify(requestData.instruments);

    await c.env.DB.prepare(
      'UPDATE users SET nickname = ?, instruments = ?, updated_at = ? WHERE email = ?'
    ).bind(requestData.nickname, instrumentsJson, now, user.email).run();

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
      SELECT DISTINCT g.*
      FROM groups g
      JOIN group_member_instruments gmi ON g.id = gmi.group_id
      WHERE gmi.user_id = ? AND g.is_active = TRUE
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

    const dbUser = await c.env.DB.prepare(
      'SELECT * FROM users WHERE id = ?'
    ).bind(user.id).first();

    if (!dbUser) {
      return c.json({ success: false, error: 'User not found' }, 404);
    }

    const groups = await c.env.DB.prepare(`
      SELECT DISTINCT g.*
      FROM groups g
      JOIN group_member_instruments gmi ON g.id = gmi.group_id
      WHERE gmi.user_id = ? AND g.is_active = TRUE
    `).bind(user.id).all();

    let parsedInstruments: string[] = [];
    try {
      parsedInstruments = JSON.parse(String(dbUser.instruments || '[]')) as string[];
    } catch (error) {
      console.error('Error parsing instruments:', error);
      parsedInstruments = [];
    }

    const userData = UserSchema.parse({
      ...dbUser,
      instruments: parsedInstruments,
      grade: Number(dbUser.grade),
    });

    const userWithStudentNumber = UserWithInstrumentsSchema.parse({
      ...userData,
      student_number: generateStudentNumber(userData.email)
    });

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
