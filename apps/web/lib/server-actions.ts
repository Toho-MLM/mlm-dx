'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { type Archive } from '../../../lib/shared-schemas'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL as string

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

async function serverActionRequest(
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

export async function createArchiveAction(data: {
  title: string
  youtube_url?: string
  year: number
}): Promise<ApiResponse<Archive>> {
  try {
    const result = await serverActionRequest('/archive', {
      method: 'POST',
      body: JSON.stringify(data),
    })
    
    revalidatePath('/archive')
    return result as ApiResponse<Archive>
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
}): Promise<ApiResponse<void>> {
  try {
    const result = await serverActionRequest('/groups', {
      method: 'POST',
      body: JSON.stringify(data),
    })
    
    revalidatePath('/band')
    return result as ApiResponse<void>
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message
    }
  }
}

export async function updateGroupAction(id: string, data: {
  name: string
  assignments?: string
  is_main?: boolean
  is_active?: boolean
}): Promise<ApiResponse<void>> {
  try {
    const result = await serverActionRequest(`/groups/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
    
    revalidatePath('/band')
    return result as ApiResponse<void>
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message
    }
  }
}

export async function deleteArchiveAction(id: string): Promise<ApiResponse<void>> {
  try {
    const result = await serverActionRequest(`/archive/${id}`, {
      method: 'DELETE',
    })
    
    revalidatePath('/archive')
    return result as ApiResponse<void>
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message
    }
  }
}

export async function createEventAction(data: {
  title: string
  event_date: string
  entry_deadline: string
  is_entry_accepting: boolean
  setlist_deadline: string
  is_setlist_accepting: boolean
  group_limit: number
  song_limit: number
}): Promise<ApiResponse<void>> {
  try {
    const result = await serverActionRequest('/events', {
      method: 'POST',
      body: JSON.stringify(data),
    })
    
    revalidatePath('/event')
    return result as ApiResponse<void>
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message
    }
  }
}

export async function updateEventAction(id: string, data: {
  title: string
  event_date: string
  entry_deadline: string
  is_entry_accepting: boolean
  setlist_deadline: string
  is_setlist_accepting: boolean
  group_limit: number
  song_limit: number
}): Promise<ApiResponse<void>> {
  try {
    const result = await serverActionRequest(`/events/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
    
    revalidatePath('/event')
    return result as ApiResponse<void>
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message
    }
  }
}

export async function deleteEventAction(id: string): Promise<ApiResponse<void>> {
  try {
    const result = await serverActionRequest(`/events/${id}`, {
      method: 'DELETE',
    })
    
    revalidatePath('/event')
    return result as ApiResponse<void>
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message
    }
  }
}
