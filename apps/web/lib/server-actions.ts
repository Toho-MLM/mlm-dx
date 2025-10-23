'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { ApiResponseSchema, ArchiveSchema, GroupWithMemberRoleSchema, type Archive, type GroupWithMemberRole } from './schemas'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL as string

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

async function serverActionRequest<T extends z.ZodType>(
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

export async function createArchiveAction(data: {
  title: string
  youtube_url?: string
  year: number
}): Promise<ApiResponse<Archive>> {
  try {
    const result = await serverActionRequest('/archive', ApiResponseSchema(ArchiveSchema), {
      method: 'POST',
      body: JSON.stringify(data),
    })
    
    revalidatePath('/archive')
    return result
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message
    }
  }
}

export async function createGroupAction(data: {
  name: string
  assignments?: string
  is_main?: boolean
}): Promise<ApiResponse<GroupWithMemberRole>> {
  try {
    const result = await serverActionRequest('/groups/upsert', ApiResponseSchema(GroupWithMemberRoleSchema), {
      method: 'POST',
      body: JSON.stringify(data),
    })
    
    revalidatePath('/band')
    return result
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message
    }
  }
}

export async function deleteArchiveAction(id: string): Promise<ApiResponse<void>> {
  try {
    const result = await serverActionRequest(`/archive/${id}`, ApiResponseSchema(z.void()), {
      method: 'DELETE',
    })
    
    revalidatePath('/archive')
    return result
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message
    }
  }
}
