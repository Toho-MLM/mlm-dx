import type { Context } from 'hono';
import Google from 'next-auth/providers/google';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  image?: string;
}

export function getAuthConfig(c: Context): any {
  return {
    secret: c.env.AUTH_SECRET,
    trustHost: true,
    basePath: '/auth',
    providers: [
      Google({
        clientId: c.env.GOOGLE_CLIENT_ID,
        clientSecret: c.env.GOOGLE_CLIENT_SECRET,
      }),
    ],
    callbacks: {
      async redirect({ url, baseUrl }: { url: string; baseUrl: string }) {
        const frontendUrl = c.env.FRONTEND_URL || 'http://localhost:3000';
        if (url.startsWith('/')) return `${frontendUrl}${url}`;
        if (new URL(url).origin === baseUrl) return `${frontendUrl}/auth/callback`;
        return frontendUrl;
      },
      async signIn({ user }: { user: AuthUser }) {
        if (!user.email) {
          console.log('No email provided');
          return false;
        }

        // ホワイトリスト判定：usersテーブルに事前登録されたメールのみ許可
        const existingUser = await c.env.DB.prepare(
          'SELECT id, name FROM users WHERE email = ?'
        ).bind(user.email).first();

        if (!existingUser) {
          console.log(`Access denied for email: ${user.email} - not in whitelist`);
          return false;
        }

        // 既存ユーザーの情報を更新（名前が変更された場合）
        if (existingUser.name !== user.name) {
          const now = new Date().toISOString();
          await c.env.DB.prepare(
            'UPDATE users SET name = ?, updated_at = ? WHERE email = ?'
          ).bind(
            user.name || user.email,
            now,
            user.email
          ).run();
          console.log(`Updated user info for: ${user.email}`);
        }

        console.log(`Access granted for email: ${user.email}`);
        return true;
      },
      async jwt({ token, user }: { token: any; user: AuthUser }) {
        if (user) {
          // usersテーブルから実際のユーザーIDを取得してsubに設定
          const dbUser = await c.env.DB.prepare(
            'SELECT id FROM users WHERE email = ?'
          ).bind(user.email).first();
          
          if (dbUser) {
            token.sub = dbUser.id; // データベースの実際のID
            token.email = user.email;
            token.name = user.name;
            token.picture = user.image;
          } else {
            // ホワイトリストにないユーザーの場合、トークンを無効化
            console.log(`User not found in whitelist: ${user.email}`);
            return null;
          }
        }
        return token;
      },
      async session({ session, token }: { session: any; token: any }) {
        if (token.sub) {
          session.user.id = token.sub;
        }
        return session;
      },
    },
    pages: {
      signIn: '/auth/signin',
      error: '/auth/error',
    },
    session: {
      strategy: 'jwt',
      maxAge: 30 * 24 * 60 * 60,
    },
    cookies: {
      sessionToken: {
        name: "next-auth.session-token",
        options: {
          httpOnly: true,
          sameSite: 'lax',
          path: '/',
          secure: c.env.NODE_ENV === 'production',
        },
      },
    },
  };
}
