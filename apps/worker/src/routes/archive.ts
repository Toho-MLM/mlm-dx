import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Bindings, Variables } from '../index';
import { requireAuth } from '../middleware/auth';
import type { ApiResponse, Archive } from '../types';

const archiveRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

archiveRoutes.get('/youtube/playlists', async (c: Context<{ Bindings: Bindings }>) => {
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: c.env.GOOGLE_CLIENT_ID,
        client_secret: c.env.GOOGLE_CLIENT_SECRET,
        refresh_token: (c.env as any).YOUTUBE_REFRESH_TOKEN,
      }).toString(),
    });

    if (!tokenRes.ok) {
      return c.json<ApiResponse>({ success: false, error: 'Failed to obtain access token' }, 500);
    }

    const { access_token } = await tokenRes.json<any>();

    let pageToken: string | undefined = undefined;
    const items: any[] = [];

    do {
      const url = new URL('https://www.googleapis.com/youtube/v3/playlists');
      url.searchParams.set('part', 'snippet,status,contentDetails');
      url.searchParams.set('mine', 'true');
      url.searchParams.set('maxResults', '50');
      if (pageToken) url.searchParams.set('pageToken', pageToken);

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${access_token}` },
      });

      if (!res.ok) {
        return c.json<ApiResponse>({ success: false, error: 'Failed to fetch playlists' }, 500);
      }

      const data = await res.json<any>();
      const unlisted = (data.items || []).filter((it: any) => it.status?.privacyStatus === 'unlisted');
      items.push(...unlisted);
      pageToken = data.nextPageToken;
    } while (pageToken);

    const mapped = items.map((it: any) => ({
      id: it.id,
      title: it.snippet?.title || '',
      description: it.snippet?.description || '',
      publishedAt: it.snippet?.publishedAt || '',
      thumbnails: it.snippet?.thumbnails || {},
      itemCount: it.contentDetails?.itemCount ?? 0,
      url: `https://www.youtube.com/playlist?list=${it.id}`,
    }));

    return c.json<ApiResponse<any[]>>({ success: true, data: mapped });
  } catch (e) {
    return c.json<ApiResponse>({ success: false, error: 'Internal server error' }, 500);
  }
});

archiveRoutes.use('*', requireAuth);

archiveRoutes.get('/group/:groupId', async (c: Context<{ Bindings: Bindings }>) => {
  try {
    const user = (c as any).get('user');
    const groupId = c.req.param('groupId');

    const member = await c.env.DB.prepare(
      'SELECT * FROM group_members WHERE group_id = ? AND user_id = ?'
    ).bind(groupId, user.id).first();

    if (!member) {
      return c.json<ApiResponse>({
        success: false,
        error: 'You are not a member of this band'
      }, 403);
    }

    const { results } = await c.env.DB.prepare(`
      SELECT * FROM archive 
      WHERE group_id = ? 
      ORDER BY created_at DESC
    `).bind(groupId).all();

    return c.json<ApiResponse<Archive[]>>({
      success: true,
      data: results as unknown as Archive[]
    });

  } catch (error) {
    console.error('Get archives error:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Internal server error'
    }, 500);
  }
});

archiveRoutes.post('/group/:groupId', async (c: Context<{ Bindings: Bindings }>) => {
  try {
    const user = (c as any).get('user');
    const groupId = c.req.param('groupId');
    const { title, description, youtube_url } = await c.req.json();

    if (!title) {
      return c.json<ApiResponse>({
        success: false,
        error: 'Title is required'
      }, 400);
    }

    const member = await c.env.DB.prepare(
      'SELECT * FROM group_members WHERE group_id = ? AND user_id = ?'
    ).bind(groupId, user.id).first();

    if (!member) {
      return c.json<ApiResponse>({
        success: false,
        error: 'You are not a member of this band'
      }, 403);
    }

    const archiveId = crypto.randomUUID();
    const now = new Date().toISOString();

    await c.env.DB.prepare(
      'INSERT INTO archive (id, group_id, title, description, youtube_url, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      archiveId,
      groupId,
      title,
      description || '',
      youtube_url || '',
      user.id,
      now,
      now
    ).run();

    const archive: Archive = {
      id: archiveId,
      group_id: groupId,
      title,
      description: description || '',
      youtube_url: youtube_url || '',
      created_by: user.id,
      created_at: now,
      updated_at: now
    };

    return c.json<ApiResponse<Archive>>({
      success: true,
      data: archive
    }, 201);

  } catch (error) {
    console.error('Create archive error:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Internal server error'
    }, 500);
  }
});

archiveRoutes.put('/:id', async (c: Context<{ Bindings: Bindings }>) => {
  try {
    const user = (c as any).get('user');
    const archiveId = c.req.param('id');
    const { title, description, youtube_url } = await c.req.json();

    const archive = await c.env.DB.prepare(
      'SELECT * FROM archive WHERE id = ?'
    ).bind(archiveId).first() as any;

    if (!archive) {
      return c.json<ApiResponse>({
        success: false,
        error: 'Archive not found'
      }, 404);
    }

    const member = await c.env.DB.prepare(
      'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?'
    ).bind(archive.group_id, user.id).first() as any;

    if (!member) {
      return c.json<ApiResponse>({
        success: false,
        error: 'You are not a member of this band'
      }, 403);
    }

    await c.env.DB.prepare(
      'UPDATE archive SET title = ?, description = ?, youtube_url = ?, updated_at = ? WHERE id = ?'
    ).bind(
      title,
      description,
      youtube_url,
      new Date().toISOString(),
      archiveId
    ).run();

    const updatedArchive = await c.env.DB.prepare(
      'SELECT * FROM archive WHERE id = ?'
    ).bind(archiveId).first() as Archive;

    return c.json<ApiResponse<Archive>>({
      success: true,
      data: updatedArchive
    });

  } catch (error) {
    console.error('Update archive error:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Internal server error'
    }, 500);
  }
});

archiveRoutes.delete('/:id', async (c: Context<{ Bindings: Bindings }>) => {
  try {
    const user = (c as any).get('user');
    const archiveId = c.req.param('id');

    const archive = await c.env.DB.prepare(
      'SELECT * FROM archive WHERE id = ?'
    ).bind(archiveId).first() as any;

    if (!archive) {
      return c.json<ApiResponse>({
        success: false,
        error: 'Archive not found'
      }, 404);
    }

    const member = await c.env.DB.prepare(
      'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?'
    ).bind(archive.group_id, user.id).first() as any;

    if (!member || member.role !== 'owner') {
      return c.json<ApiResponse>({
        success: false,
        error: 'Only band owners can delete archives'
      }, 403);
    }

    await c.env.DB.prepare('DELETE FROM archive WHERE id = ?').bind(archiveId).run();

    return c.json<ApiResponse>({
      success: true,
      message: 'Archive deleted successfully'
    });

  } catch (error) {
    console.error('Delete archive error:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Internal server error'
    }, 500);
  }
});

export { archiveRoutes };
