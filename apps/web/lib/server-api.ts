import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { 
  ApiResponseSchema, 
  SessionResponseSchema, 
  UserWithInstrumentsSchema,
  GroupWithMemberRoleSchema,
  MemberSchema,
  ReservationSchema,
  ArchiveSchema,
  type SessionResponse,
  type UserWithInstruments,
  type GroupWithMemberRole,
  type Member,
  type Reservation,
  type Archive
} from '../../../lib/shared-schemas'
import { MemberListItemSchema, type MemberListItem } from './schemas'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL as string

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

async function serverRequest(
  endpoint: string, 
  options: RequestInit = {}
): Promise<any> {
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

export async function getServerUser(): Promise<SessionResponse['user']> {
  try {
    const session = await serverRequest('/auth/session')
    return session.user
  } catch (error) {
    return null
  }
}

export async function getServerReservations(): Promise<ApiResponse<Reservation[]>> {
  return serverRequest('/reservations/fetch')
}

export async function getServerUserGroups(): Promise<ApiResponse<GroupWithMemberRole[]>> {
return serverRequest('/groups')
}

export async function getServerMemberList(): Promise<ApiResponse<MemberListItem[]>> {
  return serverRequest('/members')
}

export async function getServerMemberOptions(): Promise<ApiResponse<{ id: string; name: string; instruments: string[] }[]>> {
  return serverRequest('/groups/member-options')
}

export async function getServerArchives(): Promise<ApiResponse<Archive[]>> {
  return serverRequest('/archive')
}
