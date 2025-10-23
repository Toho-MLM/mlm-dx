import { MemberListItem } from '@/app/types'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL as string

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

class ApiClient {
  private baseUrl: string

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`
    
    const response = await fetch(url, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options,
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`)
    }

    return response.json()
  }

  // ユーザー関連
  async getUserData(email: string): Promise<ApiResponse<unknown>> {
    return this.request<ApiResponse<unknown>>(`/users/fetch/${email}`)
  }

  async updateUserData(data: { nickname: string; instruments: string[] }): Promise<ApiResponse<unknown>> {
    return this.request<ApiResponse<unknown>>('/users/update', {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async getUserGroups(): Promise<ApiResponse<unknown[]>> {
    return this.request<ApiResponse<unknown[]>>('/users/groups')
  }

  async getUserHolder(): Promise<ApiResponse<unknown>> {
    return this.request<ApiResponse<unknown>>('/users/holder')
  }

  // グループ関連
  async getGroups(): Promise<ApiResponse<unknown[]>> {
    return this.request<ApiResponse<unknown[]>>('/groups')
  }

  async createGroup(data: { name: string; assignments?: unknown; is_main?: boolean }): Promise<ApiResponse<unknown>> {
    return this.request<ApiResponse<unknown>>('/groups/upsert', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async getGroup(id: string): Promise<ApiResponse<unknown>> {
    return this.request<ApiResponse<unknown>>(`/groups/${id}`)
  }

  async updateGroup(id: string, data: { name: string; assignments?: unknown; is_main?: boolean; is_active?: boolean }): Promise<ApiResponse<unknown>> {
    return this.request<ApiResponse<unknown>>(`/groups/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async deleteGroup(id: string): Promise<ApiResponse<void>> {
    return this.request<ApiResponse<void>>(`/groups/${id}`, {
      method: 'DELETE',
    })
  }

  // メンバー関連
  async getMembers(): Promise<ApiResponse<unknown[]>> {
    return this.request<ApiResponse<unknown[]>>('/members/fetch')
  }

  async getMemberList(): Promise<ApiResponse<MemberListItem[]>> {
    return this.request<ApiResponse<MemberListItem[]>>('/members/list')
  }

  async getNickname(userId: string): Promise<ApiResponse<unknown>> {
    return this.request<ApiResponse<unknown>>(`/members/nickname/${userId}`)
  }

  async getGroupMembers(groupId: string): Promise<ApiResponse<unknown[]>> {
    return this.request<ApiResponse<unknown[]>>(`/members/group/${groupId}`)
  }

  async addMemberToGroup(groupId: string, data: { user_id: string; role?: string }): Promise<ApiResponse<unknown>> {
    return this.request<ApiResponse<unknown>>(`/members/group/${groupId}`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async removeMemberFromGroup(groupId: string, userId: string): Promise<ApiResponse<void>> {
    return this.request<ApiResponse<void>>(`/members/group/${groupId}/${userId}`, {
      method: 'DELETE',
    })
  }

  // 予約関連
  async getReservations(): Promise<ApiResponse<unknown[]>> {
    return this.request<ApiResponse<unknown[]>>('/reservations/fetch')
  }

  async getUserReservations(): Promise<ApiResponse<unknown[]>> {
    return this.request<ApiResponse<unknown[]>>('/reservations/user')
  }

  async getGroupReservations(groupId: string): Promise<ApiResponse<unknown[]>> {
    return this.request<ApiResponse<unknown[]>>(`/reservations/group/${groupId}`)
  }

  async createReservation(data: {
    start_time: string
    end_time: string
    holder_user_id?: string
    holder_group_id?: string
  }): Promise<ApiResponse<unknown>> {
    return this.request<ApiResponse<unknown>>('/reservations/create', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async cancelReservation(reservationId: number): Promise<ApiResponse<unknown>> {
    return this.request<ApiResponse<unknown>>(`/reservations/cancel/${reservationId}`, {
      method: 'PUT',
    })
  }

  // アーカイブ関連
  async getArchives(): Promise<ApiResponse<unknown[]>> {
    return this.request<ApiResponse<unknown[]>>(`/archive`)
  }

  async createArchive(data: {
    title: string
    youtube_url?: string
    year: number
  }): Promise<ApiResponse<unknown>> {
    return this.request<ApiResponse<unknown>>(`/archive`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updateArchive(id: string, data: {
    title: string
    youtube_url?: string
    year: number
  }): Promise<ApiResponse<unknown>> {
    return this.request<ApiResponse<unknown>>(`/archive/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async deleteArchive(id: string): Promise<ApiResponse<void>> {
    return this.request<ApiResponse<void>>(`/archive/${id}`, {
      method: 'DELETE',
    })
  }
}

export const apiClient = new ApiClient()