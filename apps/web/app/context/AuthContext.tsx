'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import type { User } from '@/app/types'

interface AuthContextType {
  user: User | null
  loading: boolean
  signOut: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787'}/api/auth/session`, {
          credentials: 'include',
        })
        
        if (response.ok) {
          const session = await response.json()
          setUser(session?.user || null)
        } else {
          setUser(null)
        }
      } catch (error) {
        console.error('Auth check failed:', error)
        setUser(null)
      } finally {
        setLoading(false)
      }
    }

    checkAuth()
  }, [])

  const signOut = async () => {
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787'}/api/auth/signout`, {
        method: 'POST',
        credentials: 'include',
      })
      setUser(null)
    } catch (error) {
      console.error('Sign out failed:', error)
    }
  }

  return (
    <AuthContext.Provider value={{ 
      user, 
      loading, 
      signOut
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