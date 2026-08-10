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
import { createD1UserRepository } from '../features/users/infrastructure/d1-repository';

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

    return c.json({
      success: true,
      data: await createD1UserRepository(c.env.DB).listSelectableGroups(userId, isAdminMode),
    });
  } catch (error) {
    console.error('Error fetching my group select:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

userRoutes.get('/email-notification-preferences', async (c) => {
  try {
    const user = c.get('user');
    const preferences = await createD1UserRepository(c.env.DB).findEmailPreferences(user.id);
    if (!preferences) {
      return c.json({ success: false, error: 'USER_NOT_FOUND' }, 404);
    }

    return c.json({ success: true, data: EmailNotificationPreferencesSchema.parse(preferences) });
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

    await createD1UserRepository(c.env.DB).updateEmailPreference(user.id, prime, enabled, now);

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
    await createD1UserRepository(c.env.DB).updateProfile(
      user.email, requestData.nickname, requestData.instruments, now,
    );

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
    if (error instanceof z.ZodError) {
      return c.json({ success: false, error: 'INVALID_INPUT' }, 400);
    }
    console.error('Error updating user:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

userRoutes.post('/avatar/reset', async (c) => {
  try {
    const user = c.get('user');
    const now = new Date().toISOString();

    await createD1UserRepository(c.env.DB).resetAvatar(user.id, now);

    return c.json({ success: true });
  } catch (error) {
    console.error('Error resetting avatar:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

export { userRoutes };
