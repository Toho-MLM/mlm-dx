import NextAuth from "next-auth"
import { JWT } from "next-auth/jwt"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      email: string
      name: string
      image?: string
    }
    accessToken?: string
    refreshToken?: string
    idToken?: string
    googleId?: string
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string
    accessToken?: string
    refreshToken?: string
    idToken?: string
    googleId?: string
  }
}
