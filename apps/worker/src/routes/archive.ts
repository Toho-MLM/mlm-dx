import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Bindings, Variables } from '../index';
import { requireAuth } from '../middleware/auth';
import { requireAdmin } from '../utils/admin';
import type { ApiResponse, Archive } from '../types';
import { parseUuid } from '../utils/uuid';
import { CreateArchiveRequestSchema, UpdateArchiveRequestSchema } from '../schemas';
import { z } from 'zod';
import { createD1ArchiveRepository } from '../features/archive/infrastructure/d1-repository';

const archiveRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

archiveRoutes.use('*', requireAuth);

const logValidationIssues = (operation: 'create' | 'update', error: z.ZodError) => {
  console.error(`Archive ${operation} validation error:`, JSON.stringify(
    error.issues.map((issue) => ({ code: issue.code, path: issue.path })),
  ));
};

archiveRoutes.get('/', async (c: Context<{ Bindings: Bindings; Variables: Variables }>) => {
  try {
    const results = await createD1ArchiveRepository(c.env.DB).list();

    return c.json<ApiResponse<Archive[]>>({
      success: true,
      data: results as Archive[]
    });

  } catch (error) {
    console.error('Get archives error:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'INTERNAL_SERVER_ERROR'
    }, 500);
  }
});

archiveRoutes.post('/', async (c: Context<{ Bindings: Bindings; Variables: Variables }>) => {
  try {
    requireAdmin(c.get('user').role);
    
    const { title, youtube_url, year } = CreateArchiveRequestSchema.parse(await c.req.json());

    const archiveId = crypto.randomUUID();
    const now = new Date().toISOString();

    await createD1ArchiveRepository(c.env.DB).create({ id: archiveId, title, youtube_url, year }, now);

    return c.json<ApiResponse>({ success: true }, 201);

  } catch (error) {
    if (error instanceof Error && error.message === 'INSUFFICIENT_PERMISSIONS') {
      return c.json<ApiResponse>({
        success: false,
        error: 'INSUFFICIENT_PERMISSIONS'
      }, 403);
    }
    if (error instanceof z.ZodError) {
      logValidationIssues('create', error);
      return c.json<ApiResponse>({ success: false, error: 'INVALID_INPUT' }, 400);
    }
    console.error('Create archive error:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'INTERNAL_SERVER_ERROR'
    }, 500);
  }
});

archiveRoutes.put('/:id', async (c: Context<{ Bindings: Bindings; Variables: Variables }>) => {
  try {
    requireAdmin(c.get('user').role);
    
    const archiveId = parseUuid(c.req.param('id'));
    if (!archiveId) {
      return c.json<ApiResponse>({ success: false, error: 'INVALID_INPUT' }, 400);
    }
    const { title, youtube_url, year } = UpdateArchiveRequestSchema.parse(await c.req.json());

    const repository = createD1ArchiveRepository(c.env.DB);
    if (!await repository.exists(archiveId)) {
      return c.json<ApiResponse>({
        success: false,
        error: 'ARCHIVE_NOT_FOUND'
      }, 404);
    }

    await repository.update({ id: archiveId, title, youtube_url, year }, new Date().toISOString());

    return c.json<ApiResponse>({ success: true });

  } catch (error) {
    if (error instanceof Error && error.message === 'INSUFFICIENT_PERMISSIONS') {
      return c.json<ApiResponse>({
        success: false,
        error: 'INSUFFICIENT_PERMISSIONS'
      }, 403);
    }
    if (error instanceof z.ZodError) {
      logValidationIssues('update', error);
      return c.json<ApiResponse>({ success: false, error: 'INVALID_INPUT' }, 400);
    }
    console.error('Update archive error:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'INTERNAL_SERVER_ERROR'
    }, 500);
  }
});

archiveRoutes.delete('/:id', async (c: Context<{ Bindings: Bindings; Variables: Variables }>) => {
  try {
    requireAdmin(c.get('user').role);
    
    const archiveId = parseUuid(c.req.param('id'));
    if (!archiveId) {
      return c.json<ApiResponse>({ success: false, error: 'INVALID_INPUT' }, 400);
    }

    const repository = createD1ArchiveRepository(c.env.DB);
    if (!await repository.exists(archiveId)) {
      return c.json<ApiResponse>({
        success: false,
        error: 'ARCHIVE_NOT_FOUND'
      }, 404);
    }

    await repository.delete(archiveId);

    return c.json<ApiResponse>({
      success: true,
      message: 'Archive deleted successfully'
    });

  } catch (error) {
    console.error('Delete archive error:', error);
    if (error instanceof Error && error.message === 'INSUFFICIENT_PERMISSIONS') {
      return c.json<ApiResponse>({
        success: false,
        error: 'INSUFFICIENT_PERMISSIONS'
      }, 403);
    }
    return c.json<ApiResponse>({
      success: false,
      error: 'INTERNAL_SERVER_ERROR'
    }, 500);
  }
});

export { archiveRoutes };
