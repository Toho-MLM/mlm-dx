import { Hono } from 'hono';
import { isAdmin } from '@shared-schemas';
import { requireAuth } from '../middleware/auth';
import type { Bindings, Variables } from '../index';
import { getDashboard } from '../features/dashboard/application/get-dashboard';
import { createD1DashboardRepository } from '../features/dashboard/infrastructure/d1-repository';

const dashboardRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();
dashboardRoutes.use('*', requireAuth);

dashboardRoutes.get('/', async (c) => {
  try {
    const user = c.get('user');
    const data = await getDashboard(createD1DashboardRepository(c.env.DB), user.id, isAdmin(user.role));
    return c.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching dashboard:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

export { dashboardRoutes };
