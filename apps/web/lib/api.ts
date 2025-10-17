const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787'

export interface User {
  id: string
  email: string
  name: string
  image?: string
}

export interface Session {
  user: User
  accessToken?: string
}

export interface ApiResponse<T = any> {
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

  private async getAuthHeaders(): Promise<Record<string, string>> {
    if (typeof document === 'undefined') return {}
    const token = document.cookie.split('; ').find((row) => row.startsWith('auth_token='))?.split('=')[1]
    if (!token) return {}
    return { Authorization: `Bearer ${token}` }
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`
    
    const authHeaders = await this.getAuthHeaders()
    
    const defaultOptions: RequestInit = {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
        ...options.headers,
      },
    }

    const response = await fetch(url, { ...defaultOptions, ...options })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`)
    }

    return response.json()
  }

  // 認証関連
  async getSession(): Promise<Session | null> {
    if (typeof document === 'undefined') return null
    const token = document.cookie.split('; ').find((row) => row.startsWith('auth_token='))?.split('=')[1]
    if (!token) return null
    try {
      const me = await this.request<ApiResponse<User>>('/api/users/me')
      return me?.data ? { user: me.data, accessToken: token } : null
    } catch {
      return null
    }
  }

  async signOut(): Promise<void> {
    if (typeof document !== 'undefined') {
      document.cookie = `auth_token=; Path=/; Max-Age=0`
      window.location.href = '/login'
    }
  }

  // ユーザー関連
  async getUserData(email: string): Promise<ApiResponse<any>> {
    return this.request<ApiResponse<any>>(`/api/users/fetch/${email}`)
  }

  async updateUserData(data: { nickname: string; instruments: string[] }): Promise<ApiResponse<any>> {
    return this.request<ApiResponse<any>>('/api/users/update', {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async getUserGroups(): Promise<ApiResponse<any[]>> {
    return this.request<ApiResponse<any[]>>('/api/users/groups')
  }

  async getUserHolder(): Promise<ApiResponse<any>> {
    return this.request<ApiResponse<any>>('/api/users/holder')
  }

  // グループ関連
  async getGroups(): Promise<ApiResponse<any[]>> {
    return this.request<ApiResponse<any[]>>('/api/groups')
  }

  async createGroup(data: { name: string; assignments?: any; is_main?: boolean }): Promise<ApiResponse<any>> {
    return this.request<ApiResponse<any>>('/api/groups/upsert', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async getGroup(id: string): Promise<ApiResponse<any>> {
    return this.request<ApiResponse<any>>(`/api/groups/${id}`)
  }

  async updateGroup(id: string, data: { name: string; assignments?: any; is_main?: boolean; is_active?: boolean }): Promise<ApiResponse<any>> {
    return this.request<ApiResponse<any>>(`/api/groups/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async deleteGroup(id: string): Promise<ApiResponse<void>> {
    return this.request<ApiResponse<void>>(`/api/groups/${id}`, {
      method: 'DELETE',
    })
  }

  // メンバー関連
  async getMembers(): Promise<ApiResponse<any[]>> {
    return this.request<ApiResponse<any[]>>('/api/members/fetch')
  }

  async getMemberList(): Promise<ApiResponse<any[]>> {
    return this.request<ApiResponse<any[]>>('/api/members/list')
  }

  async getNickname(userId: string): Promise<ApiResponse<any>> {
    return this.request<ApiResponse<any>>(`/api/members/nickname/${userId}`)
  }

  async getGroupMembers(groupId: string): Promise<ApiResponse<any[]>> {
    return this.request<ApiResponse<any[]>>(`/api/members/group/${groupId}`)
  }

  async addMemberToGroup(groupId: string, data: { user_id: string; role?: string }): Promise<ApiResponse<any>> {
    return this.request<ApiResponse<any>>(`/api/members/group/${groupId}`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async removeMemberFromGroup(groupId: string, userId: string): Promise<ApiResponse<void>> {
    return this.request<ApiResponse<void>>(`/api/members/group/${groupId}/${userId}`, {
      method: 'DELETE',
    })
  }

  // 予約関連
  async getReservations(): Promise<ApiResponse<any[]>> {
    return this.request<ApiResponse<any[]>>('/api/reservations/fetch')
  }

  async getUserReservations(): Promise<ApiResponse<any[]>> {
    return this.request<ApiResponse<any[]>>('/api/reservations/user')
  }

  async getGroupReservations(groupId: string): Promise<ApiResponse<any[]>> {
    return this.request<ApiResponse<any[]>>(`/api/reservations/group/${groupId}`)
  }

  async createReservation(data: {
    start_time: string
    end_time: string
    group_id?: string
    notes?: string
  }): Promise<ApiResponse<any>> {
    return this.request<ApiResponse<any>>('/api/reservations/create', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async cancelReservation(reservationId: number): Promise<ApiResponse<any>> {
    return this.request<ApiResponse<any>>(`/api/reservations/cancel/${reservationId}`, {
      method: 'PUT',
    })
  }

  // アーカイブ関連
  async getArchives(groupId: string): Promise<ApiResponse<any[]>> {
    return this.request<ApiResponse<any[]>>(`/api/archive/group/${groupId}`)
  }

  async createArchive(groupId: string, data: {
    title: string
    description?: string
    youtube_url?: string
  }): Promise<ApiResponse<any>> {
    return this.request<ApiResponse<any>>(`/api/archive/group/${groupId}`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updateArchive(id: string, data: {
    title: string
    description?: string
    youtube_url?: string
  }): Promise<ApiResponse<any>> {
    return this.request<ApiResponse<any>>(`/api/archive/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async deleteArchive(id: string): Promise<ApiResponse<void>> {
    return this.request<ApiResponse<void>>(`/api/archive/${id}`, {
      method: 'DELETE',
    })
  }
}

export const apiClient = new ApiClient()
