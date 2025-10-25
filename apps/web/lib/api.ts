import { MemberListItem } from '@/app/types'
import { z } from 'zod'
import { MemberListItemSchema } from './schemas'
import * as SharedSchemas from '../../../lib/shared-schemas'
import { httpClient } from './http-client'

type User = SharedSchemas.User
type Group = SharedSchemas.Group
type Reservation = SharedSchemas.Reservation
type Archive = SharedSchemas.Archive
type CreateGroupRequest = SharedSchemas.CreateGroupRequest
type UpdateGroupRequest = SharedSchemas.UpdateGroupRequest
type UpdateUserRequest = SharedSchemas.UpdateUserRequest
type AddMemberToGroupRequest = SharedSchemas.AddMemberToGroupRequest
type CreateReservationRequest = SharedSchemas.CreateReservationRequest
type CreateArchiveRequest = SharedSchemas.CreateArchiveRequest
type UpdateArchiveRequest = SharedSchemas.UpdateArchiveRequest
type ApiResponse<T> = SharedSchemas.ApiResponse<T>

class ApiClient {

  // ユーザー関連
  async getCurrentUserData(): Promise<ApiResponse<User>> {
    return httpClient.get<ApiResponse<User>>(`/users/me`)
  }

  async updateUserData(data: UpdateUserRequest): Promise<ApiResponse<User>> {
    SharedSchemas.UpdateUserRequestSchema.parse(data)
    return httpClient.put<ApiResponse<User>>('/users/me', data)
  }

  async getUserGroups(): Promise<ApiResponse<Group[]>> {
    return httpClient.get<ApiResponse<Group[]>>('/groups')
  }

  async getGroupOptions(): Promise<ApiResponse<{ id: string; name: string }[]>> {
    return httpClient.get<ApiResponse<{ id: string; name: string }[]>>('/groups/options')
  }

  async getMemberOptions(): Promise<ApiResponse<{ id: string; name: string; instruments: string[] }[]>> {
    return httpClient.get<ApiResponse<{ id: string; name: string; instruments: string[] }[]>>('/groups/member-options')
  }

  // グループ関連
  async getGroups(): Promise<ApiResponse<Group[]>> {
    return httpClient.get<ApiResponse<Group[]>>('/groups')
  }

  async createGroup(data: CreateGroupRequest): Promise<ApiResponse<Group>> {
    SharedSchemas.CreateGroupRequestSchema.parse(data)
    return httpClient.post<ApiResponse<Group>>('/groups', data)
  }

  async updateGroup(id: string, data: UpdateGroupRequest): Promise<ApiResponse<Group>> {
    SharedSchemas.UpdateGroupRequestSchema.parse(data)
    return httpClient.put<ApiResponse<Group>>(`/groups/${id}`, data)
  }

  async deleteGroup(id: string): Promise<ApiResponse<void>> {
    return httpClient.delete<ApiResponse<void>>(`/groups/${id}`)
  }

  // メンバー関連
  async getMemberList(): Promise<ApiResponse<MemberListItem[]>> {
    return httpClient.get<ApiResponse<MemberListItem[]>>('/members')
  }

  // 予約関連
  async getReservations(): Promise<ApiResponse<Reservation[]>> {
    return httpClient.get<ApiResponse<Reservation[]>>('/reservations/fetch')
  }



  async createReservation(data: CreateReservationRequest): Promise<{ success: boolean; status?: string; details?: any; error?: string }> {
    SharedSchemas.CreateReservationRequestSchema.parse(data)
    return httpClient.post<{ success: boolean; status?: string; details?: any; error?: string }>('/reservations/create', data)
  }

  async cancelReservation(reservationId: number): Promise<ApiResponse<void>> {
    return httpClient.put<ApiResponse<void>>(`/reservations/cancel/${reservationId}`)
  }

  // アーカイブ関連
  async getArchives(): Promise<ApiResponse<Archive[]>> {
    return httpClient.get<ApiResponse<Archive[]>>(`/archive`)
  }

  async createArchive(data: CreateArchiveRequest): Promise<ApiResponse<Archive>> {
    SharedSchemas.CreateArchiveRequestSchema.parse(data)
    return httpClient.post<ApiResponse<Archive>>(`/archive`, data)
  }

  async updateArchive(id: string, data: UpdateArchiveRequest): Promise<ApiResponse<Archive>> {
    SharedSchemas.UpdateArchiveRequestSchema.parse(data)
    return httpClient.put<ApiResponse<Archive>>(`/archive/${id}`, data)
  }

  async deleteArchive(id: string): Promise<ApiResponse<void>> {
    return httpClient.delete<ApiResponse<void>>(`/archive/${id}`)
  }
}

export const apiClient = new ApiClient()