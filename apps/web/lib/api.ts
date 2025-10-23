import { MemberListItem } from '@/app/types'
import { z } from 'zod'

const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  nickname: z.string().nullable(),
  instruments: z.array(z.string()),
  student_number: z.string(),
  created_at: z.string(),
  updated_at: z.string().nullable(),
})

const GroupSchema = z.object({
  id: z.string(),
  name: z.string(),
  assignments: z.string().nullable(),
  is_main: z.boolean(),
  is_active: z.boolean(),
  created_at: z.string(),
  updated_at: z.string().nullable(),
})

const ReservationSchema = z.object({
  id: z.number(),
  start_time: z.string(),
  end_time: z.string(),
  holder_user_id: z.string().nullable(),
  holder_group_id: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string().nullable(),
})

const ArchiveSchema = z.object({
  id: z.string(),
  title: z.string(),
  youtube_url: z.string().nullable(),
  year: z.number(),
  created_at: z.string(),
  updated_at: z.string().nullable(),
})

const CreateGroupRequestSchema = z.object({
  name: z.string().min(1),
  assignments: z.string().optional(),
  is_main: z.boolean().optional(),
})

const UpdateGroupRequestSchema = z.object({
  name: z.string().min(1),
  assignments: z.string().optional(),
  is_main: z.boolean().optional(),
  is_active: z.boolean().optional(),
})

const UpdateUserRequestSchema = z.object({
  nickname: z.string(),
  instruments: z.array(z.string()),
})

const AddMemberToGroupRequestSchema = z.object({
  user_id: z.string(),
  role: z.string().optional(),
})

const CreateReservationRequestSchema = z.object({
  start_time: z.string(),
  end_time: z.string(),
  holder_user_id: z.string().optional(),
  holder_group_id: z.string().optional(),
})

const CreateArchiveRequestSchema = z.object({
  title: z.string().min(1),
  youtube_url: z.string().url().optional(),
  year: z.number().min(1900).max(new Date().getFullYear() + 10),
})

const UpdateArchiveRequestSchema = z.object({
  title: z.string().min(1),
  youtube_url: z.string().url().optional(),
  year: z.number().min(1900).max(new Date().getFullYear() + 10),
})

type User = z.infer<typeof UserSchema>
type Group = z.infer<typeof GroupSchema>
type Reservation = z.infer<typeof ReservationSchema>
type Archive = z.infer<typeof ArchiveSchema>
type CreateGroupRequest = z.infer<typeof CreateGroupRequestSchema>
type UpdateGroupRequest = z.infer<typeof UpdateGroupRequestSchema>
type UpdateUserRequest = z.infer<typeof UpdateUserRequestSchema>
type AddMemberToGroupRequest = z.infer<typeof AddMemberToGroupRequestSchema>
type CreateReservationRequest = z.infer<typeof CreateReservationRequestSchema>
type CreateArchiveRequest = z.infer<typeof CreateArchiveRequestSchema>
type UpdateArchiveRequest = z.infer<typeof UpdateArchiveRequestSchema>

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL as string

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

const ApiResponseSchema = <T extends z.ZodType>(dataSchema: T) =>
  z.object({
    success: z.boolean(),
    data: dataSchema.optional(),
    error: z.string().optional(),
    message: z.string().optional(),
  })

class ApiClient {
  private baseUrl: string

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl
  }

  private async request<T>(endpoint: string, options: RequestInit = {}, schema?: z.ZodType<T>): Promise<T> {
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

    const data = await response.json()
    
    if (schema) {
      return schema.parse(data)
    }
    
    return data
  }

  // ユーザー関連
  async getUserData(email: string): Promise<ApiResponse<User>> {
    const schema = ApiResponseSchema(UserSchema)
    return this.request<ApiResponse<User>>(`/users/fetch/${email}`, {}, schema)
  }

  async updateUserData(data: UpdateUserRequest): Promise<ApiResponse<void>> {
    UpdateUserRequestSchema.parse(data)
    const schema = ApiResponseSchema(z.void())
    return this.request<ApiResponse<void>>('/users/update', {
      method: 'PUT',
      body: JSON.stringify(data),
    }, schema)
  }

  async getUserGroups(): Promise<ApiResponse<Group[]>> {
    const schema = ApiResponseSchema(z.array(GroupSchema))
    return this.request<ApiResponse<Group[]>>('/users/groups', {}, schema)
  }

  async getUserHolder(): Promise<ApiResponse<{ user: User; bands: Group[] }>> {
    const schema = ApiResponseSchema(z.object({
      user: UserSchema,
      bands: z.array(GroupSchema)
    }))
    return this.request<ApiResponse<{ user: User; bands: Group[] }>>('/users/holder', {}, schema)
  }

  // グループ関連
  async getGroups(): Promise<ApiResponse<Group[]>> {
    const schema = ApiResponseSchema(z.array(GroupSchema))
    return this.request<ApiResponse<Group[]>>('/groups', {}, schema)
  }

  async createGroup(data: CreateGroupRequest): Promise<ApiResponse<Group>> {
    CreateGroupRequestSchema.parse(data)
    const schema = ApiResponseSchema(GroupSchema)
    return this.request<ApiResponse<Group>>('/groups/upsert', {
      method: 'POST',
      body: JSON.stringify(data),
    }, schema)
  }

  async getGroup(id: string): Promise<ApiResponse<Group>> {
    const schema = ApiResponseSchema(GroupSchema)
    return this.request<ApiResponse<Group>>(`/groups/${id}`, {}, schema)
  }

  async updateGroup(id: string, data: UpdateGroupRequest): Promise<ApiResponse<Group>> {
    UpdateGroupRequestSchema.parse(data)
    const schema = ApiResponseSchema(GroupSchema)
    return this.request<ApiResponse<Group>>(`/groups/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }, schema)
  }

  async deleteGroup(id: string): Promise<ApiResponse<void>> {
    const schema = ApiResponseSchema(z.void())
    return this.request<ApiResponse<void>>(`/groups/${id}`, {
      method: 'DELETE',
    }, schema)
  }

  // メンバー関連
  async getMembers(): Promise<ApiResponse<User[]>> {
    const schema = ApiResponseSchema(z.array(UserSchema))
    return this.request<ApiResponse<User[]>>('/members/fetch', {}, schema)
  }

  async getMemberList(): Promise<ApiResponse<MemberListItem[]>> {
    const schema = ApiResponseSchema(z.array(z.any()))
    return this.request<ApiResponse<MemberListItem[]>>('/members/list', {}, schema)
  }

  async getNickname(userId: string): Promise<ApiResponse<{ nickname: string }>> {
    const schema = ApiResponseSchema(z.object({ nickname: z.string() }))
    return this.request<ApiResponse<{ nickname: string }>>(`/members/nickname/${userId}`, {}, schema)
  }

  async getGroupMembers(groupId: string): Promise<ApiResponse<User[]>> {
    const schema = ApiResponseSchema(z.array(UserSchema))
    return this.request<ApiResponse<User[]>>(`/members/group/${groupId}`, {}, schema)
  }

  async addMemberToGroup(groupId: string, data: AddMemberToGroupRequest): Promise<ApiResponse<void>> {
    AddMemberToGroupRequestSchema.parse(data)
    const schema = ApiResponseSchema(z.void())
    return this.request<ApiResponse<void>>(`/members/group/${groupId}`, {
      method: 'POST',
      body: JSON.stringify(data),
    }, schema)
  }

  async removeMemberFromGroup(groupId: string, userId: string): Promise<ApiResponse<void>> {
    const schema = ApiResponseSchema(z.void())
    return this.request<ApiResponse<void>>(`/members/group/${groupId}/${userId}`, {
      method: 'DELETE',
    }, schema)
  }

  // 予約関連
  async getReservations(): Promise<ApiResponse<Reservation[]>> {
    const schema = ApiResponseSchema(z.array(ReservationSchema))
    return this.request<ApiResponse<Reservation[]>>('/reservations/fetch', {}, schema)
  }

  async getUserReservations(): Promise<ApiResponse<Reservation[]>> {
    const schema = ApiResponseSchema(z.array(ReservationSchema))
    return this.request<ApiResponse<Reservation[]>>('/reservations/user', {}, schema)
  }

  async getGroupReservations(groupId: string): Promise<ApiResponse<Reservation[]>> {
    const schema = ApiResponseSchema(z.array(ReservationSchema))
    return this.request<ApiResponse<Reservation[]>>(`/reservations/group/${groupId}`, {}, schema)
  }

  async createReservation(data: CreateReservationRequest): Promise<ApiResponse<Reservation>> {
    CreateReservationRequestSchema.parse(data)
    const schema = ApiResponseSchema(ReservationSchema)
    return this.request<ApiResponse<Reservation>>('/reservations/create', {
      method: 'POST',
      body: JSON.stringify(data),
    }, schema)
  }

  async cancelReservation(reservationId: number): Promise<ApiResponse<void>> {
    const schema = ApiResponseSchema(z.void())
    return this.request<ApiResponse<void>>(`/reservations/cancel/${reservationId}`, {
      method: 'PUT',
    }, schema)
  }

  // アーカイブ関連
  async getArchives(): Promise<ApiResponse<Archive[]>> {
    const schema = ApiResponseSchema(z.array(ArchiveSchema))
    return this.request<ApiResponse<Archive[]>>(`/archive`, {}, schema)
  }

  async createArchive(data: CreateArchiveRequest): Promise<ApiResponse<Archive>> {
    CreateArchiveRequestSchema.parse(data)
    const schema = ApiResponseSchema(ArchiveSchema)
    return this.request<ApiResponse<Archive>>(`/archive`, {
      method: 'POST',
      body: JSON.stringify(data),
    }, schema)
  }

  async updateArchive(id: string, data: UpdateArchiveRequest): Promise<ApiResponse<Archive>> {
    UpdateArchiveRequestSchema.parse(data)
    const schema = ApiResponseSchema(ArchiveSchema)
    return this.request<ApiResponse<Archive>>(`/archive/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }, schema)
  }

  async deleteArchive(id: string): Promise<ApiResponse<void>> {
    const schema = ApiResponseSchema(z.void())
    return this.request<ApiResponse<void>>(`/archive/${id}`, {
      method: 'DELETE',
    }, schema)
  }
}

export const apiClient = new ApiClient()