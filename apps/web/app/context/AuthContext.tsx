'use client'

import { createContext, useContext } from 'react'
import { useSession, signOut } from 'next-auth/react'
import type { User } from '@/app/types'

interface AuthContextType {
  user: User | null
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const { data: session, status } = useSession()

  return (
    <AuthContext.Provider value={{ 
      user: session?.user as User | null, 
      loading: status === 'loading', 
      signOut: () => signOut({ callbackUrl: '/login' })
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within an AuthProvider')
  return context
}