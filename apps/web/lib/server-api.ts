import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { cache } from 'react'
import { 
  type SessionResponse,
  type GroupWithMemberRole,
  type Reservation,
  type Archive,
  type User
} from '../../../lib/shared-schemas'
import { type MemberListItem } from './schemas'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL as string

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

async function serverRequest<T = unknown>(
  endpoint: string, 
  options: Parameters<typeof fetch>[1] = {}
): Promise<T> {
  const cookieStore = await cookies()
  const cookieHeader = cookieStore.toString()
  
  const url = `${API_BASE_URL}${endpoint}`
  
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      'Cookie': cookieHeader,
      ...options.headers,
    },
    ...options,
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(errorData.error || `HTTP error! status: ${response.status}`)
  }

  return await response.json()
}

export const getServerUser = cache(async (): Promise<SessionResponse['user']> => {
  try {
    const session = await serverRequest<SessionResponse>('/auth/session')
    return session.user
  } catch (error) {
    return null
  }
})

export const requireAuth = cache(async (): Promise<SessionResponse['user']> => {
  const user = await getServerUser()
  if (!user) {
    redirect('/login')
  }
  return user
})

export async function getServerReservations(admin: boolean = false): Promise<ApiResponse<Reservation[]>> {
  const params = admin ? '?admin=true' : '';
  return serverRequest(`/reservations${params}`)
}

export async function getServerUserGroups(admin: boolean = false): Promise<ApiResponse<GroupWithMemberRole[]>> {
  const params = admin ? '?admin=true' : '';
  return serverRequest(`/groups${params}`)
}

export async function getServerMemberList(): Promise<ApiResponse<MemberListItem[]>> {
  return serverRequest('/members')
}

export async function getServerMemberOptions(): Promise<ApiResponse<{ id: string; name: string; display_name?: string; real_name?: string; instruments: string[] }[]>> {
  return serverRequest('/members/select')
}

export async function getServerArchives(): Promise<ApiResponse<Archive[]>> {
  return serverRequest('/archive')
}

export async function getServerUserData(): Promise<ApiResponse<User>> {
  return serverRequest('/me')
}
