import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { 
  ApiResponseSchema, 
  SessionResponseSchema, 
  UserHolderResponseSchema,
  UserWithInstrumentsSchema,
  GroupWithMemberRoleSchema,
  MemberSchema,
  ReservationSchema,
  ArchiveSchema,
  type SessionResponse,
  type UserHolderResponse,
  type UserWithInstruments,
  type GroupWithMemberRole,
  type Member,
  type Reservation,
  type Archive
} from './schemas'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL as string

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

async function serverRequest<T extends z.ZodType>(
  endpoint: string, 
  schema: T, 
  options: RequestInit = {}
): Promise<z.infer<T>> {
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

  const data = await response.json()
  return schema.parse(data)
}

export async function getServerUser(): Promise<SessionResponse['user']> {
  try {
    const session = await serverRequest('/auth/session', SessionResponseSchema)
    return session.user
  } catch (error) {
    return null
  }
}

export async function getServerReservations(): Promise<ApiResponse<Reservation[]>> {
  return serverRequest('/reservations/fetch', ApiResponseSchema(z.array(ReservationSchema)))
}

export async function getServerUserHolder(): Promise<ApiResponse<UserHolderResponse>> {
  return serverRequest('/users/holder', ApiResponseSchema(UserHolderResponseSchema))
}

export async function getServerUserGroups(): Promise<ApiResponse<GroupWithMemberRole[]>> {
  return serverRequest('/users/groups', ApiResponseSchema(z.array(GroupWithMemberRoleSchema)))
}

export async function getServerMembers(): Promise<ApiResponse<Member[]>> {
  return serverRequest('/members/fetch', ApiResponseSchema(z.array(MemberSchema)))
}

export async function getServerArchives(): Promise<ApiResponse<Archive[]>> {
  return serverRequest('/archive', ApiResponseSchema(z.array(ArchiveSchema)))
}
