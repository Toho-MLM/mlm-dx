import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth';
import type { Bindings, Variables } from '../index';
import { requireAdmin } from '../utils/admin';
import { DraftStateSchema, INSTRUMENTS, type DraftState } from '../band-draft-state';

type DraftRow = {
  id: string;
  share_token: string;
  state_json: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};

const bandMainDraftRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

bandMainDraftRoutes.use('*', requireAuth);

function createShareToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function parseDraftState(value: string): DraftState {
  return DraftStateSchema.parse(JSON.parse(value));
}

function createInitialState(memberIds: string[]): DraftState {
  const cells: DraftState['cells'] = {};
  for (let index = 1; index <= 3; index += 1) {
    const columnId = crypto.randomUUID();
    cells[columnId] = {};
    for (const instrument of INSTRUMENTS) {
      cells[columnId][instrument] = [];
    }
  }

  const columns = Object.keys(cells).map((id, index) => ({
    id,
    name: `バンド${index + 1}`,
  }));

  return {
    columns,
    cells,
    unassignedMemberIds: memberIds,
    version: 0,
  };
}

async function fetchDraftByToken(env: Bindings, token: string): Promise<DraftRow | null> {
  return await env.DB.prepare(`
    SELECT *
    FROM main_band_drafts
    WHERE share_token = ?
      AND id = (
        SELECT id
        FROM main_band_drafts
        ORDER BY created_at DESC
        LIMIT 1
      )
  `).bind(token).first<DraftRow>();
}

async function fetchLatestDraft(env: Bindings): Promise<DraftRow | null> {
  return await env.DB.prepare(`
    SELECT *
    FROM main_band_drafts
    ORDER BY created_at DESC
    LIMIT 1
  `).first<DraftRow>();
}

async function deleteDraftsExcept(env: Bindings, draftId: string): Promise<void> {
  await env.DB.prepare(`
    DELETE FROM main_band_drafts
    WHERE id != ?
  `).bind(draftId).run();
}

function canManageDraft(user: Variables['user'], draft: DraftRow): boolean {
  return user.role !== 'MBR' && draft.created_by === user.id;
}

async function getMemberOptions(env: Bindings) {
  const rows = await env.DB.prepare(`
    SELECT
      id,
      name,
      nickname,
      instruments,
      UPPER(SUBSTR(email, 1, 6)) as student_number
    FROM users
    ORDER BY grade DESC, UPPER(SUBSTR(email, 1, 6)) ASC
  `).all<{ id: string; name: string; nickname: string | null; instruments: string; student_number: string }>();

  return (rows.results ?? []).map((row) => ({
    id: row.id,
    name: `${row.student_number} ${row.nickname || row.name}`,
    instruments: safeJsonParse(row.instruments, [] as string[]),
  }));
}

function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
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
    const state = createInitialState(members.map((member) => member.id));

    await c.env.DB.prepare(`
      INSERT INTO main_band_drafts (id, share_token, state_json, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      shareToken,
      JSON.stringify(state),
      user.id,
      now,
      now
    ).run();

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
        updatedAt: draft.updated_at,
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
    let createdCount = 0;

    for (const column of state.columns) {
      const columnCells = state.cells[column.id] ?? {};
      const assignments: Array<{ instrument: string; memberId: string }> = [];

      for (const instrument of INSTRUMENTS) {
        for (const memberId of columnCells[instrument] ?? []) {
          assignments.push({ instrument, memberId });
        }
      }

      if (assignments.length === 0) {
        continue;
      }

      const groupId = crypto.randomUUID();
      await c.env.DB.prepare(`
        INSERT INTO groups (id, name, is_main, is_active, created_at, updated_at)
        VALUES (?, ?, TRUE, TRUE, ?, ?)
      `).bind(groupId, `本バンド${createdCount + 1}`, now, now).run();

      for (const assignment of assignments) {
        await c.env.DB.prepare(`
          INSERT INTO group_member_instruments (id, group_id, user_id, instrument, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).bind(
          crypto.randomUUID(),
          groupId,
          assignment.memberId,
          assignment.instrument,
          now,
          now
        ).run();
      }

      createdCount += 1;
    }

    await c.env.DB.prepare(`
      DELETE FROM main_band_drafts
      WHERE id = ?
    `).bind(draft.id).run();

    return c.json({ success: true, data: { createdCount } });
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

    await c.env.DB.prepare(`
      DELETE FROM main_band_drafts
      WHERE id = ?
    `).bind(draft.id).run();

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
