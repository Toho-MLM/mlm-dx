import NextAuth from "next-auth"
import Google from "next-auth/providers/google"

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  secret: process.env.AUTH_SECRET,
  trustHost: true,
  pages: { signIn: '/login' },
  session: { strategy: 'jwt' },
  basePath: '/auth',
  cookies: {
    sessionToken: {
      name: "__Host-next-auth.session-token",
      options: { 
        httpOnly: true, 
        sameSite: "lax", 
        secure: true 
      },
    },
  },
  callbacks: {
    async redirect({ url, baseUrl }) {
      return url.startsWith("/") ? `${baseUrl}${url}` : baseUrl
    },
    async signIn({ user }) {
      if (!user.email) {
        console.log('No email provided');
        return false;
      }

      // ホワイトリスト判定はバックエンド側（Worker）で実行
      // フロントエンド側では常にtrueを返し、実際の判定はWorker側に委ねる
      console.log(`SignIn attempt for email: ${user.email}`);
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        // ユーザーIDの取得はバックエンド側（Worker）で実行
        // フロントエンド側ではGoogle IDをそのまま使用し、Worker側でDB IDに変換
        token.sub = user.id;
        token.email = user.email;
        token.name = user.name;
        token.picture = user.image;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
})