'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import type { User } from '@/app/types'
import { httpClient } from '@/lib/http-client'

interface AuthContextType {
  user: User | null
  loading: boolean
  signOut: () => void
  refreshAuth: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const session = await httpClient.get('/auth/session') as { user?: User }
        setUser(session?.user || null)
      } catch (error) {
        console.error('Auth check failed:', error)
        setUser(null)
      } finally {
        setLoading(false)
      }
    }

    checkAuth()
  }, [])

  const refreshAuth = async () => {
    try {
      const session = await httpClient.get('/auth/session') as { user?: User }
      setUser(session?.user || null)
    } catch (error) {
      console.error('Auth refresh failed:', error)
      setUser(null)
    }
  }

  const signOut = async () => {
    try {
      await httpClient.post('/auth/signout')
      setUser(null)
    } catch (error) {
      console.error('Sign out failed:', error)
      setUser(null)
    }
  }

  return (
    <AuthContext.Provider value={{ 
      user, 
      loading, 
      signOut,
      refreshAuth
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