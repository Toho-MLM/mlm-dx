import { getCloudflareContext } from '@opennextjs/cloudflare'
import { redirect } from 'next/navigation'
import { cookies, headers } from 'next/headers'
import { cache } from 'react'
import { isAdmin, type SessionResponse, type GroupWithMemberRole, type Reservation, type Archive, type User } from '../../../lib/shared-schemas'
import { type MemberListItem } from './schemas'
import { getLoginPath, sanitizeRedirectPath } from './auth-redirect'

type ServerRequestInit = globalThis.RequestInit

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

function getSeparatedDevelopmentOrigin(): string | null {
  if (process.env.NODE_ENV !== 'development') return null
  const configuredOrigin = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '')
  if (configuredOrigin) return configuredOrigin
  return 'http://localhost:8787'
}

async function fetchApi(request: Request): Promise<Response> {
  try {
    const service = getCloudflareContext().env.WORKER_SELF_REFERENCE
    if (service) return service.fetch(request)
  } catch {
    // next dev では Cloudflare request context がないため、分離 Worker へフォールバックする。
  }

  return fetch(request)
}

export async function serverRequest<T = unknown>(
  endpoint: string,
  options: ServerRequestInit = {},
): Promise<T> {
  const cookieStore = await cookies()
  const requestHeaders = await headers()
  const developmentOrigin = getSeparatedDevelopmentOrigin()
  const forwardedHost = requestHeaders.get('x-forwarded-host') || requestHeaders.get('host')
  const forwardedProtocol = requestHeaders.get('x-forwarded-proto') || 'https'
  const origin = developmentOrigin || (forwardedHost ? `${forwardedProtocol}://${forwardedHost}` : 'https://worker.internal')
  const url = `${origin}/api${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`
  const request = new Request(url, {
    ...options,
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookieStore.toString(),
      ...options.headers,
    },
  })
  const response = await fetchApi(request)

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({})) as { error?: string }
    throw new Error(errorData.error || `HTTP error! status: ${response.status}`)
  }

  return response.json() as Promise<T>
}

export async function settleServerRequest<T>(request: Promise<T>): Promise<T | null> {
  try {
    return await request
  } catch {
    return null
  }
}

export const getServerUser = cache(async (): Promise<SessionResponse['user']> => {
  try {
    const session = await serverRequest<SessionResponse>('/auth/session')
    return session.user
  } catch {
    return null
  }
})

export const requireAuth = cache(async (requestedPath?: string): Promise<NonNullable<SessionResponse['user']>> => {
  const user = await getServerUser()
  if (!user) {
    const safePath = sanitizeRedirectPath(requestedPath)
    redirect(safePath ? getLoginPath(safePath) : '/login')
  }
  return user
})

export const requireServerAdmin = cache(async (): Promise<NonNullable<SessionResponse['user']>> => {
  const user = await requireAuth()
  if (!isAdmin(user.role)) redirect('/')
  return user
})

export async function getServerAdminMode(user: NonNullable<SessionResponse['user']>): Promise<boolean> {
  return isAdmin(user.role) && (await cookies()).get('mlm-dx-admin-mode')?.value === 'true'
}

export async function getServerReservations(admin: boolean = false): Promise<ApiResponse<Reservation[]>> {
  const params = admin ? '?admin=true' : ''
  return serverRequest(`/reservations${params}`)
}

export async function getServerUserGroups(admin: boolean = false): Promise<ApiResponse<GroupWithMemberRole[]>> {
  const params = admin ? '?admin=true' : ''
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
