import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth';
import type { Bindings, Variables } from '../index';
import { requireAdmin } from '../utils/admin';
import type { DraftRow } from '../features/band-draft/application/repository';
import { createInitialDraftState, groupsFromDraft, parseDraftState } from '../features/band-draft/domain/draft';
import { createD1BandDraftRepository } from '../features/band-draft/infrastructure/d1-repository';

const bandMainDraftRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

bandMainDraftRoutes.use('*', requireAuth);

function createShareToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function fetchDraftByToken(env: Bindings, token: string): Promise<DraftRow | null> {
  return createD1BandDraftRepository(env.DB).findByToken(token);
}

async function fetchLatestDraft(env: Bindings): Promise<DraftRow | null> {
  return createD1BandDraftRepository(env.DB).findLatest();
}

async function deleteDraftsExcept(env: Bindings, draftId: string): Promise<void> {
  await createD1BandDraftRepository(env.DB).deleteExcept(draftId);
}

function canManageDraft(user: Variables['user'], draft: DraftRow): boolean {
  return user.role !== 'MBR' && draft.created_by === user.id;
}

async function getMemberOptions(env: Bindings) {
  return createD1BandDraftRepository(env.DB).listMembers();
}

bandMainDraftRoutes.post('/', async (c) => {
  try {
    const user = c.get('user');
    requireAdmin(user.role);

    const latestDraft = await fetchLatestDraft(c.env);
    if (latestDraft) {
      await deleteDraftsExcept(c.env, latestDraft.id);
      return c.json({ success: true, data: { shareToken: latestDraft.share_token } });
    }

    const now = new Date().toISOString();
    const members = await getMemberOptions(c.env);
    const id = crypto.randomUUID();
    const shareToken = createShareToken();
    const state = createInitialDraftState(members.map((member) => member.id), () => crypto.randomUUID());
    await createD1BandDraftRepository(c.env.DB).create({
      id, share_token: shareToken, state_json: JSON.stringify(state), created_by: user.id,
    }, now);

    return c.json({ success: true, data: { shareToken } });
  } catch (error) {
    console.error('Error creating band main draft:', error);
    if (error instanceof Error && error.message === 'INSUFFICIENT_PERMISSIONS') {
      return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403);
    }
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

bandMainDraftRoutes.get('/:token', async (c) => {
  try {
    const token = c.req.param('token');
    const draft = await fetchDraftByToken(c.env, token);
    if (!draft) {
      return c.json({ success: false, error: 'DRAFT_NOT_FOUND' }, 404);
    }

    const user = c.get('user');
    const members = await getMemberOptions(c.env);

    return c.json({
      success: true,
      data: {
        id: draft.id,
        shareToken: draft.share_token,
        state: parseDraftState(draft.state_json),
        members,
        canFinalize: canManageDraft(user, draft),
        canDelete: canManageDraft(user, draft),
      },
    });
  } catch (error) {
    console.error('Error fetching band main draft:', error);
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

bandMainDraftRoutes.get('/:token/ws', async (c) => {
  const token = c.req.param('token');
  const upgradeHeader = c.req.header('Upgrade');
  if (upgradeHeader?.toLowerCase() !== 'websocket') {
    return c.text('Expected Upgrade: websocket', 426);
  }

  const draft = await fetchDraftByToken(c.env, token);
  if (!draft) {
    return c.json({ success: false, error: 'DRAFT_NOT_FOUND' }, 404);
  }

  const id = c.env.BAND_DRAFT_ROOM.idFromName(token);
  const room = c.env.BAND_DRAFT_ROOM.get(id);
  const typedRoom = room as unknown as {
    fetch(request: globalThis.Request): Promise<globalThis.Response>;
  };
  return await typedRoom.fetch(c.req.raw as unknown as globalThis.Request);
});

bandMainDraftRoutes.post('/:token/finalize', async (c) => {
  try {
    const user = c.get('user');
    requireAdmin(user.role);

    const token = c.req.param('token');
    const draft = await fetchDraftByToken(c.env, token);
    if (!draft) {
      return c.json({ success: false, error: 'DRAFT_NOT_FOUND' }, 404);
    }
    if (!canManageDraft(user, draft)) {
      return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403);
    }
    const state = parseDraftState(draft.state_json);
    const now = new Date().toISOString();
    const groupsToCreate = groupsFromDraft(state, () => crypto.randomUUID());

    const memberIds = [...new Set(groupsToCreate.flatMap((group) => (
      group.assignments.map((assignment) => assignment.memberId)
    )))];
    if (memberIds.length > 0) {
      if (!await createD1BandDraftRepository(c.env.DB).membersExist(memberIds)) {
        return c.json({ success: false, error: 'DRAFT_MEMBER_NOT_FOUND' }, 409);
      }
    }

    if (!await createD1BandDraftRepository(c.env.DB).finalize(draft, groupsToCreate, now, () => crypto.randomUUID())) {
      return c.json({ success: false, error: 'DRAFT_NOT_FOUND' }, 409);
    }

    return c.json({ success: true, data: { createdCount: groupsToCreate.length } });
  } catch (error) {
    console.error('Error finalizing band main draft:', error);
    if (error instanceof Error && error.message === 'INSUFFICIENT_PERMISSIONS') {
      return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403);
    }
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

bandMainDraftRoutes.delete('/:token', async (c) => {
  try {
    const user = c.get('user');
    requireAdmin(user.role);

    const token = c.req.param('token');
    const draft = await fetchDraftByToken(c.env, token);
    if (!draft) {
      return c.json({ success: false, error: 'DRAFT_NOT_FOUND' }, 404);
    }
    if (!canManageDraft(user, draft)) {
      return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403);
    }

    await createD1BandDraftRepository(c.env.DB).delete(draft.id);

    return c.json({ success: true });
  } catch (error) {
    console.error('Error deleting band main draft:', error);
    if (error instanceof Error && error.message === 'INSUFFICIENT_PERMISSIONS') {
      return c.json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' }, 403);
    }
    return c.json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, 500);
  }
});

export { bandMainDraftRoutes };
