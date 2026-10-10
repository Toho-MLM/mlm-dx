import { Hono } from 'hono';
import { z } from 'zod';
import { requireAdmin, SaveExecutiveTransitionRequestSchema, CancelExecutiveTransitionRequestSchema } from '@shared-schemas';
import type { Bindings, Variables } from '../index';
import { requireAuth } from '../middleware/auth';
import { ExecutiveTransitionError } from '../features/executive-transition/application/service';
import { createExecutiveTransitionService } from '../features/executive-transition/infrastructure/service';

export const executiveTransitionRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();
executiveTransitionRoutes.use('*', requireAuth);
executiveTransitionRoutes.use('*', async (c, next) => {
  try {
    requireAdmin(c.get('user').role);
  }
  catch { return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403); }
  await next();
  return c.res;
});
executiveTransitionRoutes.onError((error, c) => {
  if (error instanceof z.ZodError || error instanceof SyntaxError) {
    return c.json({ success: false, error: 'INVALID_REQUEST_DATA' }, 400);
  }
  if (error instanceof ExecutiveTransitionError) {
    return c.json({ success: false, error: error.code }, error.code === 'TRANSITION_CONFLICT' ? 409 : 400);
  }
  console.error('Executive transition failed:', error);
  return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
});
executiveTransitionRoutes.get('/', async (c) => {
  return c.json({ success: true, data: await createExecutiveTransitionService(c.env.DB).get() });
});
executiveTransitionRoutes.put('/', async (c) => {
  const request = SaveExecutiveTransitionRequestSchema.parse(await c.req.json());
  return c.json({ success: true, data: await createExecutiveTransitionService(c.env.DB).save(request) });
});
executiveTransitionRoutes.delete('/', async (c) => {
  const request = CancelExecutiveTransitionRequestSchema.parse(await c.req.json());
  await createExecutiveTransitionService(c.env.DB).cancel(request.expected_revision);
  return c.json({ success: true });
});
