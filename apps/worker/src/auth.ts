import type { AuthConfig } from '@auth/core';
import Google from '@auth/core/providers/google';
import type { Context } from 'hono';
import type { D1Database } from '@cloudflare/workers-types';
import type { AuthUser, AuthAccount, AuthSession, AuthVerificationToken } from './types';

// カスタムD1アダプタ
function createD1Adapter(db: D1Database): any {
  return {
    async createUser(user: AuthUser) {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      
      await db.prepare(
        'INSERT INTO users (id, email, name, image, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(
        id,
        user.email,
        user.name || user.email,
        user.image || '',
        now,
        now
      ).run();
      
      return { id, ...user };
    },
    
    async getUser(id: string) {
      const user = await db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
      return user || null;
    },
    
    async getUserByEmail(email: string) {
      const user = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
      return user || null;
    },
    
    async getUserByAccount({ providerAccountId, provider }: { providerAccountId: string; provider: string }) {
      const result = await db.prepare(
        'SELECT u.* FROM users u JOIN google_accounts ga ON u.id = ga.user_id WHERE ga.google_id = ?'
      ).bind(providerAccountId).first();
      return result || null;
    },
    
    async updateUser(user: AuthUser) {
      const now = new Date().toISOString();
      await db.prepare(
        'UPDATE users SET name = ?, image = ?, updated_at = ? WHERE id = ?'
      ).bind(user.name, user.image, now, user.id).run();
      return user;
    },
    
    async linkAccount(account: AuthAccount) {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      
      await db.prepare(
        'INSERT INTO google_accounts (id, user_id, google_id, refresh_token, access_token, expires_at, token_type, scope, id_token, session_state, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(
        id,
        account.userId,
        account.providerAccountId,
        account.refresh_token,
        account.access_token,
        account.expires_at,
        account.token_type,
        account.scope,
        account.id_token,
        account.session_state,
        now,
        now
      ).run();
      
      return account;
    },
    
    async unlinkAccount({ providerAccountId }: { providerAccountId: string }) {
      await db.prepare('DELETE FROM google_accounts WHERE google_id = ?').bind(providerAccountId).run();
    },
    
    async createSession(session: AuthSession) {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      
      await db.prepare(
        'INSERT INTO sessions (id, session_token, user_id, expires, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(
        id,
        session.sessionToken,
        session.userId,
        session.expires,
        now,
        now
      ).run();
      
      return session;
    },
    
    async getSessionAndUser(sessionToken: string) {
      const result = await db.prepare(
        'SELECT s.*, u.* FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.session_token = ?'
      ).bind(sessionToken).first();
      
      if (!result) return { session: null, user: null };
      
      const session = {
        sessionToken: result.session_token,
        userId: result.user_id,
        expires: result.expires,
      };
      
      const user = {
        id: result.id,
        email: result.email,
        name: result.name,
        image: result.image,
      };
      
      return { session, user };
    },
    
    async updateSession(session: AuthSession) {
      const now = new Date().toISOString();
      await db.prepare(
        'UPDATE sessions SET expires = ?, updated_at = ? WHERE session_token = ?'
      ).bind(session.expires, now, session.sessionToken).run();
      return session;
    },
    
    async deleteSession(sessionToken: string) {
      await db.prepare('DELETE FROM sessions WHERE session_token = ?').bind(sessionToken).run();
    },
    
    async createVerificationToken(token: AuthVerificationToken) {
      await db.prepare(
        'INSERT INTO verification_tokens (identifier, token, expires) VALUES (?, ?, ?)'
      ).bind(token.identifier, token.token, token.expires).run();
      return token;
    },
    
    async useVerificationToken({ identifier, token }: { identifier: string; token: string }) {
      const result = await db.prepare(
        'SELECT * FROM verification_tokens WHERE identifier = ? AND token = ?'
      ).bind(identifier, token).first();
      
      if (!result) return null;
      
      await db.prepare(
        'DELETE FROM verification_tokens WHERE identifier = ? AND token = ?'
      ).bind(identifier, token).run();
      
      return result;
    },
  };
}

export function getAuthConfig(c: Context): AuthConfig {
  return {
    secret: c.env.AUTH_SECRET,
    trustHost: true,
    basePath: '/auth',
    adapter: createD1Adapter(c.env.DB),
    providers: [
      Google({
        clientId: c.env.GOOGLE_CLIENT_ID,
        clientSecret: c.env.GOOGLE_CLIENT_SECRET,
      }),
    ],
    callbacks: {
      async redirect({ url, baseUrl }) {
        // フロントエンドのドメインにリダイレクト
        const frontendUrl = c.env.FRONTEND_URL || 'http://localhost:3000'
        if (url.startsWith('/')) return `${frontendUrl}${url}`
        if (new URL(url).origin === baseUrl) return `${frontendUrl}/auth/callback`
        return frontendUrl
      },
      async signIn({ user }) {
        if (!user.email) {
          return false;
        }

        // usersテーブルでホワイトリスト判定
        const existingUser = await c.env.DB.prepare(
          'SELECT id FROM users WHERE email = ?'
        ).bind(user.email).first();

        if (!existingUser) {
          console.log(`Access denied for email: ${user.email}`);
          return false;
        }

        // 既存ユーザーの情報を更新
        const now = new Date().toISOString();
        await c.env.DB.prepare(
          'UPDATE users SET name = ?, image = ?, updated_at = ? WHERE email = ?'
        ).bind(
          user.name || user.email,
          user.image || '',
          now,
          user.email
        ).run();

        return true;
      },
      async session({ session, user }) {
        if (session.user) {
          session.user.id = user.id;
        }
        return session;
      },
    },
    pages: {
      signIn: '/auth/signin',
      error: '/auth/error',
    },
    session: {
      strategy: 'database',
      maxAge: 30 * 24 * 60 * 60, // 30 days
    },
    cookies: {
      sessionToken: {
        name: 'next-auth.session-token',
        options: {
          httpOnly: true,
          sameSite: 'none',
          path: '/',
          secure: true,
        },
      },
    },
  };
}
