import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth';
import type { Bindings, Variables } from '../index';
import {
  EmailNotificationPreferencesSchema,
  EmailNotificationTypeSchema,
  UpdateEmailNotificationPreferenceRequestSchema,
  UserWithInstrumentsSchema,
  UpdateUserRequestSchema,
} from '../schemas';
import { requireAdmin } from '../utils/admin';
import { z } from 'zod';
import { getEmailNotificationPrime } from '../utils/email-notification-preferences';

const userRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

userRoutes.use('*', requireAuth);

userRoutes.get('/', async (c) => {
  try {
    const user = c.get('user');
    
    const { picture, ...userWithoutPicture } = user;
    void picture;
    
    const userDataToValidate = {
      ...userWithoutPicture,
      student_number: user.email.substring(0, 6).toUpperCase()
    };
    
    const userWithStudentNumber = UserWithInstrumentsSchema.parse(userDataToValidate);

    return c.json({ success: true, data: userWithStudentNumber });
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('Zod validation errors:');
      error.issues.forEach((issue) => {
        if ('expected' in issue && 'received' in issue) {
          const typedIssue = issue as z.ZodIssue & { expected?: string; received?: string };
          console.error(`  Path: ${JSON.stringify(issue.path)}, Expected: ${typedIssue.expected}, Received: ${typedIssue.received}`);
        } else {
          console.error(`  Path: ${JSON.stringify(issue.path)}, Issue: ${issue.code}`);
        }
      });
    }
    console.error('Error fetching current user:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

userRoutes.get('/groups/select', async (c) => {
  try {
    const user = c.get('user');
    const userId = user.id;

    const adminParam = c.req.query('admin');
    const isAdminMode = adminParam === 'true';

    if (isAdminMode) {
      try {
        requireAdmin(user.role);
      } catch (error) {
        return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403);
      }
    }

    let query: string;
    let params: string[];

    if (isAdminMode) {
      query = `
        SELECT DISTINCT g.id, g.name, g.is_main
        FROM groups g
        WHERE g.is_active = TRUE
        ORDER BY g.is_main DESC, g.created_at DESC
      `;
      params = [];
    } else {
      query = `
        SELECT DISTINCT g.id, g.name, g.is_main
        FROM groups g
        JOIN group_member_instruments gmi ON g.id = gmi.group_id
        WHERE gmi.user_id = ? AND g.is_active = TRUE
        ORDER BY g.is_main DESC, g.created_at DESC
      `;
      params = [userId];
    }

    const groups = await c.env.DB.prepare(query).bind(...params).all();

    return c.json({ success: true, data: groups.results });
  } catch (error) {
    console.error('Error fetching my group select:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

userRoutes.get('/email-notification-preferences', async (c) => {
  try {
    const user = c.get('user');
    const row = await c.env.DB.prepare(`
      SELECT
        email_notification_preference_code % 2 = 0 AS reservation_received,
        email_notification_preference_code % 3 = 0 AS reservation_confirmed,
        email_notification_preference_code % 5 = 0 AS reservation_edited,
        email_notification_preference_code % 7 = 0 AS reservation_adjusted,
        email_notification_preference_code % 11 = 0 AS reservation_declined,
        email_notification_preference_code % 13 = 0 AS reservation_cancelled,
        email_notification_preference_code % 17 = 0 AS reservation_revoked
      FROM users
      WHERE id = ?
    `).bind(user.id).first<{
      reservation_received: number;
      reservation_confirmed: number;
      reservation_edited: number;
      reservation_adjusted: number;
      reservation_declined: number;
      reservation_cancelled: number;
      reservation_revoked: number;
    }>();

    if (!row) {
      return c.json({ success: false, error: 'USER_NOT_FOUND' }, 404);
    }

    const preferences = EmailNotificationPreferencesSchema.parse({
      RESERVATION_RECEIVED: Boolean(row.reservation_received),
      RESERVATION_CONFIRMED: Boolean(row.reservation_confirmed),
      RESERVATION_EDITED: Boolean(row.reservation_edited),
      RESERVATION_ADJUSTED: Boolean(row.reservation_adjusted),
      RESERVATION_DECLINED: Boolean(row.reservation_declined),
      RESERVATION_CANCELLED: Boolean(row.reservation_cancelled),
      RESERVATION_REVOKED: Boolean(row.reservation_revoked),
    });

    return c.json({ success: true, data: preferences });
  } catch (error) {
    console.error('Error fetching email notification preferences:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

userRoutes.put('/email-notification-preferences/:type', async (c) => {
  try {
    const user = c.get('user');
    const type = EmailNotificationTypeSchema.parse(c.req.param('type'));
    const { enabled } = UpdateEmailNotificationPreferenceRequestSchema.parse(await c.req.json());
    const prime = getEmailNotificationPrime(type);
    const now = new Date().toISOString();

    if (enabled) {
      await c.env.DB.prepare(`
        UPDATE users
        SET email_notification_preference_code = CASE
              WHEN email_notification_preference_code % ? = 0 THEN email_notification_preference_code
              ELSE email_notification_preference_code * ?
            END,
            updated_at = ?
        WHERE id = ?
      `).bind(prime, prime, now, user.id).run();
    } else {
      await c.env.DB.prepare(`
        UPDATE users
        SET email_notification_preference_code = CASE
              WHEN email_notification_preference_code % ? = 0 THEN email_notification_preference_code / ?
              ELSE email_notification_preference_code
            END,
            updated_at = ?
        WHERE id = ?
      `).bind(prime, prime, now, user.id).run();
    }

    return c.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ success: false, error: 'INVALID_EMAIL_NOTIFICATION_PREFERENCE' }, 400);
    }
    console.error('Error updating email notification preference:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

userRoutes.put('/', async (c) => {
  try {
    const user = c.get('user');
    const requestData = UpdateUserRequestSchema.parse(await c.req.json());

    const now = new Date().toISOString();
    const instrumentsJson = JSON.stringify(requestData.instruments);

    await c.env.DB.prepare(
      'UPDATE users SET nickname = ?, instruments = ?, updated_at = ? WHERE email = ?'
    ).bind(requestData.nickname, instrumentsJson, now, user.email).run();

    if (requestData.nickname !== user.nickname) {
      const { generateJWT } = await import('../auth');
      const { setCookie } = await import('hono/cookie');
      
      const jwt = await generateJWT({
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.picture,
      }, requestData.nickname, c.env.AUTH_SECRET);

      setCookie(c, 'auth_token', jwt, {
        httpOnly: true,
        secure: c.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60,
        path: '/',
      });
    }

    return c.json({ success: true });
  } catch (error) {
    console.error('Error updating user:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

userRoutes.post('/avatar/reset', async (c) => {
  try {
    const user = c.get('user');
    const now = new Date().toISOString();

    await c.env.DB.prepare(
      'UPDATE users SET avatar = NULL, updated_at = ? WHERE id = ?'
    ).bind(now, user.id).run();

    return c.json({ success: true });
  } catch (error) {
    console.error('Error resetting avatar:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

export { userRoutes };
