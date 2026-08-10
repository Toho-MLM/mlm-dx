import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth';
import { requireAdmin } from '../utils/admin';
import type { Bindings, Variables } from '../index';
import { z } from 'zod';
import { parseUuid } from '../utils/uuid';
import { duplicateEmails } from '../features/members/domain/bulk';
import { createD1MemberRepository } from '../features/members/infrastructure/d1-repository';

const memberRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

memberRoutes.use('*', requireAuth);

memberRoutes.get('/', async (c) => {
  try {
    return c.json({ success: true, data: await createD1MemberRepository(c.env.DB).list() });
  } catch (error) {
    console.error('Error fetching member list:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

memberRoutes.post('/', async (c) => {
  try {
    const user = c.get('user');
    requireAdmin(user.role);

    const requestData = z.object({
      name: z.string().min(1),
      email: z.string().email(),
      grade: z.number().min(1).max(6),
    }).parse(await c.req.json());

    const normalizedEmail = requestData.email.trim().toLowerCase();

    const repository = createD1MemberRepository(c.env.DB);
    if (await repository.emailExists(normalizedEmail)) {
      return c.json({ success: false, error: 'EMAIL_ALREADY_EXISTS' }, 409);
    }

    const now = new Date().toISOString();
    const newId = crypto.randomUUID();
    
    await repository.create({
      id: newId, name: requestData.name, nickname: null, email: normalizedEmail,
      grade: requestData.grade, instruments: [], role: 'MBR',
    }, now);
    
    return c.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ success: false, error: 'INVALID_REQUEST_DATA' }, 400);
    }
    
    if (error && typeof error === 'object' && 'message' in error) {
      const errorMessage = String(error.message);
      if (errorMessage.includes('UNIQUE constraint failed') || errorMessage.includes('email')) {
        return c.json({ success: false, error: 'EMAIL_ALREADY_EXISTS' }, 409);
      }
    }
    
    console.error('Error creating member:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

memberRoutes.put('/:id', async (c) => {
  try {
    const user = c.get('user');
    requireAdmin(user.role);

    const memberId = parseUuid(c.req.param('id'));
    if (!memberId) {
      return c.json({ success: false, error: 'INVALID_INPUT' }, 400);
    }
    const requestData = z.object({
      nickname: z.string().min(1),
      grade: z.number().min(1).max(6),
      instruments: z.array(z.string()),
      role: z.enum(['MGR', 'CHF', 'MAC', 'MBR', 'ADM', 'NHD', 'NAC']),
    }).parse(await c.req.json());

    const now = new Date().toISOString();

    await createD1MemberRepository(c.env.DB).update(memberId, {
      nickname: requestData.nickname || null,
      grade: requestData.grade,
      instruments: requestData.instruments,
      role: requestData.role,
    }, now);

    return c.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ success: false, error: 'INVALID_REQUEST_DATA' }, 400);
    }
    
    if (error && typeof error === 'object' && 'message' in error) {
      const errorMessage = String(error.message);
      if (errorMessage.includes('UNIQUE constraint failed') || errorMessage.includes('email')) {
        return c.json({ success: false, error: 'EMAIL_ALREADY_EXISTS' }, 409);
      }
    }
    
    console.error('Error updating member:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

memberRoutes.post('/bulk', async (c) => {
  try {
    const user = c.get('user');
    requireAdmin(user.role);

    const requestData = z.object({
      members: z.array(z.object({
        name: z.string().min(1),
        email: z.string().email(),
        grade: z.number().min(1).max(6),
        nickname: z.string().optional(),
        instruments: z.array(z.string()).optional(),
        role: z.enum(['MGR', 'CHF', 'MAC', 'MBR', 'ADM', 'NHD', 'NAC']).optional(),
      })),
    }).parse(await c.req.json());

    const now = new Date().toISOString();
    const results = {
      created: [] as string[],
      failed: [] as Array<{ email: string; error: string }>,
    };

    const normalizedMembers = requestData.members.map(m => ({
      name: m.name,
      email: m.email.trim().toLowerCase(),
      grade: m.grade,
      nickname: m.nickname ?? null,
      instruments: Array.isArray(m.instruments) ? m.instruments : [],
      role: m.role,
    }));

    const inputDuplicates = duplicateEmails(normalizedMembers);

    for (const dup of inputDuplicates) {
      results.failed.push({ email: dup, error: 'DUPLICATE_IN_INPUT' });
    }

    const uniqueEmails = [...new Set(normalizedMembers.map((member) => member.email))];
    if (uniqueEmails.length > 0) {
      const repository = createD1MemberRepository(c.env.DB);
      const existingEmails = await repository.existingEmails(uniqueEmails);

      for (const m of normalizedMembers) {
        if (inputDuplicates.has(m.email)) {
          continue;
        }
        if (existingEmails.has(m.email)) {
          results.failed.push({ email: m.email, error: 'EMAIL_ALREADY_EXISTS' });
          continue;
        }
        try {
          const newId = crypto.randomUUID();
          await repository.create({ id: newId, name: m.name, nickname: m.nickname, email: m.email,
            grade: m.grade, instruments: m.instruments, role: m.role ?? 'MBR' }, now);
          results.created.push(m.email);
        } catch (error) {
          results.failed.push({ email: m.email, error: 'INTERNAL_ERROR' });
        }
      }
    }

    return c.json({ 
      success: true, 
      data: {
        created: results.created,
        failed: results.failed,
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ success: false, error: 'INVALID_REQUEST_DATA' }, 400);
    }
    
    console.error('Error creating members in bulk:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

memberRoutes.post('/move-up-grade', async (c) => {
  try {
    const user = c.get('user');
    requireAdmin(user.role);

    const now = new Date().toISOString();
    const { deletedCount, movedUpCount } = await createD1MemberRepository(c.env.DB).moveUpGrades(now);

    return c.json({
      success: true,
      data: {
        deletedCount,
        movedUpCount,
      },
    });
  } catch (error) {
    console.error('Error moving up grades:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

memberRoutes.delete('/:id', async (c) => {
  try {
    const user = c.get('user');
    requireAdmin(user.role);

    const memberId = parseUuid(c.req.param('id'));
    if (!memberId) {
      return c.json({ success: false, error: 'INVALID_INPUT' }, 400);
    }

    const repository = createD1MemberRepository(c.env.DB);
    if (!await repository.exists(memberId)) {
      return c.json({ success: false, error: 'MEMBER_NOT_FOUND' }, 404);
    }

    await repository.delete(memberId);

    return c.json({ success: true, message: 'Member deleted successfully' });
  } catch (error) {
    console.error('Error deleting member:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

memberRoutes.get('/select', async (c) => {
  try {
    const user = c.get('user');
    const currentUserId = user.id;

    return c.json({ success: true, data: await createD1MemberRepository(c.env.DB).listForSelect(currentUserId) });
  } catch (error) {
    console.error('Error fetching member select:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

export { memberRoutes };
