'use server'

import { revalidatePath } from 'next/cache'
import { type Archive } from '../../../lib/shared-schemas'
import { serverRequest } from './server-api'

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

export async function createArchiveAction(data: {
  title: string
  youtube_url?: string
  year: number
}): Promise<ApiResponse<Archive>> {
  try {
    const result = await serverRequest('/archive', {
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
  main_index?: number | null
}): Promise<ApiResponse<void>> {
  try {
    const result = await serverRequest('/groups', {
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
  main_index?: number | null
  is_active?: boolean
}): Promise<ApiResponse<void>> {
  try {
    const result = await serverRequest(`/groups/${id}`, {
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
    const result = await serverRequest(`/archive/${id}`, {
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
    const result = await serverRequest('/events', {
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
    const result = await serverRequest(`/events/${id}`, {
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
    const result = await serverRequest(`/events/${id}`, {
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
