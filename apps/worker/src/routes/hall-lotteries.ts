import { Hono } from 'hono';
import { ZodError } from 'zod';
import {
  CreateHallLotteryRequestSchema,
  CreateHallLotteryApplicationRequestSchema,
  isAdmin,
} from '@shared-schemas';
import type { Bindings, Variables } from '../index';
import { requireAuth } from '../middleware/auth';
import { requireAdmin } from '../utils/admin';
import { parseUuid } from '../utils/uuid';
import { HallLotteryError } from '../features/reservations/application/hall-lottery';
import { createD1HallLotteryRepository } from '../features/reservations/infrastructure/d1-hall-lottery-repository';
import { hallLotteryService } from '../utils/hall-lottery';
export const hallLotteryRoutes = new Hono<{
  Bindings: Bindings;
  Variables: Variables;
}>();
hallLotteryRoutes.use('*', requireAuth);
hallLotteryRoutes.onError((error, c) => {
  if (error instanceof ZodError || error instanceof SyntaxError)
    return c.json({ success: false, error: 'INVALID_INPUT' }, 400);
  if (
    error.message === 'INSUFFICIENT_PERMISSIONS' ||
    error.message === 'NOT_GROUP_MEMBER'
  )
    return c.json({ success: false, error: error.message }, 403);
  if (error instanceof HallLotteryError)
    return c.json(
      { success: false, error: error.message },
      error.message === 'INVALID_INPUT' ||
        error.message === 'GROUP_NOT_FOUND' ||
        error.message === 'HALL_LOTTERY_BAND_TYPE_MISMATCH'
        ? 400
        : error.message === 'LOTTERY_NOT_FOUND'
          ? 404
          : 409,
    );
  console.error('Hall lottery API failed', error);
  return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
});
hallLotteryRoutes.use('/:id/*', async (c, next) => {
  if (!parseUuid(c.req.param('id')))
    return c.json({ success: false, error: 'INVALID_INPUT' }, 400);
  return next();
});
hallLotteryRoutes.get('/', async (c) =>
  c.json({
    success: true,
    data: await createD1HallLotteryRepository(c.env.DB).list(),
  }),
);
hallLotteryRoutes.post('/', async (c) => {
  requireAdmin(c.get('user').role);
  return c.json({
    success: true,
    data: await hallLotteryService(c.env).create(
      CreateHallLotteryRequestSchema.parse(await c.req.json()),
    ),
  });
});
hallLotteryRoutes.post('/:id/cancel', async (c) => {
  requireAdmin(c.get('user').role);
  await hallLotteryService(c.env).cancel(c.req.param('id'));
  return c.json({ success: true });
});
hallLotteryRoutes.get('/:id/applications', async (c) => {
  const user = c.get('user');
  return c.json({
    success: true,
    data: await createD1HallLotteryRepository(c.env.DB).applications(
      c.req.param('id'),
      isAdmin(user.role) ? undefined : user.id,
    ),
  });
});
hallLotteryRoutes.post('/:id/applications', async (c) => {
  const data = CreateHallLotteryApplicationRequestSchema.parse(
    await c.req.json(),
  );
  return c.json({
    success: true,
    data: await hallLotteryService(c.env).apply(
      c.req.param('id'),
      c.get('user').id,
      data.group_id,
      data.preferences,
      isAdmin(c.get('user').role),
    ),
  });
});
hallLotteryRoutes.post('/:id/applications/:applicationId/cancel', async (c) => {
  const id = parseUuid(c.req.param('applicationId'));
  if (!id) return c.json({ success: false, error: 'INVALID_INPUT' }, 400);
  const user = c.get('user');
  const admin = isAdmin(user.role);
  const applications = await createD1HallLotteryRepository(
    c.env.DB,
  ).applications(c.req.param('id'), admin ? undefined : user.id);
  if (!applications.some((a) => a.id === id))
    return c.json({ success: false, error: 'LOTTERY_NOT_FOUND' }, 404);
  await hallLotteryService(c.env).cancelApplication(id, user.id, admin);
  return c.json({ success: true });
});
