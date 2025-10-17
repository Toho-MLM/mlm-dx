import type { AuthConfig } from '@auth/core';
import Google from '@auth/core/providers/google';
import type { Context } from 'hono';

export function getAuthConfig(c: Context): AuthConfig {
  return {
    secret: c.env.AUTH_SECRET,
    trustHost: true,
    basePath: '/api/auth',
    providers: [
      Google({
        clientId: c.env.GOOGLE_CLIENT_ID,
        clientSecret: c.env.GOOGLE_CLIENT_SECRET,
      }),
    ],
    callbacks: {
      async signIn({ user, account, profile }) {
        if (!user.email) {
          return false;
        }

        const existingUser = await c.env.DB.prepare(
          'SELECT id FROM users WHERE email = ?'
        ).bind(user.email).first();

        if (!existingUser) {
          const userId = crypto.randomUUID();
          const now = new Date().toISOString();
          
          await c.env.DB.prepare(
            'INSERT INTO users (id, email, name, image, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
          ).bind(
            userId,
            user.email,
            user.name || user.email,
            user.image || '',
            now,
            now
          ).run();
        } else {
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
        }

        return true;
      },
    },
  };
}
