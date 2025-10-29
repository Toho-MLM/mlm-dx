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
type Event = SharedSchemas.Event
type CreateEventRequest = SharedSchemas.CreateEventRequest
type UpdateEventRequest = SharedSchemas.UpdateEventRequest
type Entry = SharedSchemas.Entry
type CreateEntryRequest = SharedSchemas.CreateEntryRequest
type ApiResponse<T> = SharedSchemas.ApiResponse<T>

class ApiClient {

  // ユーザー関連
  async getCurrentUserData(): Promise<ApiResponse<User>> {
    return httpClient.get<ApiResponse<User>>(`/me`)
  }

  async updateUserData(data: UpdateUserRequest): Promise<ApiResponse<void>> {
    SharedSchemas.UpdateUserRequestSchema.parse(data)
    return httpClient.put<ApiResponse<void>>('/me', data)
  }

  async getUserGroups(admin: boolean = false): Promise<ApiResponse<Group[]>> {
    const params = admin ? '?admin=true' : '';
    return httpClient.get<ApiResponse<Group[]>>(`/groups${params}`)
  }

  async getGroupOptions(): Promise<ApiResponse<{ id: string; name: string; is_main: boolean }[]>> {
    return httpClient.get<ApiResponse<{ id: string; name: string; is_main: boolean }[]>>('/groups/options-simple')
  }

  async getMemberOptions(): Promise<ApiResponse<{ id: string; name: string; instruments: string[] }[]>> {
    return httpClient.get<ApiResponse<{ id: string; name: string; instruments: string[] }[]>>('/groups/options')
  }

  // グループ関連
  async getGroups(): Promise<ApiResponse<Group[]>> {
    return httpClient.get<ApiResponse<Group[]>>('/groups')
  }

  async createGroup(data: CreateGroupRequest): Promise<ApiResponse<void>> {
    SharedSchemas.CreateGroupRequestSchema.parse(data)
    return httpClient.post<ApiResponse<void>>('/groups', data)
  }

  async updateGroup(id: string, data: UpdateGroupRequest): Promise<ApiResponse<void>> {
    SharedSchemas.UpdateGroupRequestSchema.parse(data)
    return httpClient.put<ApiResponse<void>>(`/groups/${id}`, data)
  }

  async deleteGroup(id: string): Promise<ApiResponse<void>> {
    return httpClient.delete<ApiResponse<void>>(`/groups/${id}`)
  }

  // メンバー関連
  async getMemberList(): Promise<ApiResponse<MemberListItem[]>> {
    return httpClient.get<ApiResponse<MemberListItem[]>>('/members')
  }

  async createMember(data: {
    name: string;
    email: string;
    grade: number;
  }): Promise<ApiResponse<void>> {
    return httpClient.post<ApiResponse<void>>('/members', data)
  }

  async updateMember(id: string, data: {
    nickname: string;
    grade: number;
    instruments: string[];
    role: string;
  }): Promise<ApiResponse<void>> {
    return httpClient.put<ApiResponse<void>>(`/members/${id}`, data)
  }

  async deleteMember(id: string): Promise<ApiResponse<void>> {
    return httpClient.delete<ApiResponse<void>>(`/members/${id}`)
  }

  async bulkCreateMembers(members: Array<{
    name: string;
    email: string;
    grade: number;
    nickname?: string;
    instruments?: string[];
    role?: string;
  }>): Promise<ApiResponse<{ created: string[]; failed: Array<{ email: string; error: string }> }>> {
    return httpClient.post<ApiResponse<{ created: string[]; failed: Array<{ email: string; error: string }> }>>('/members/bulk', { members })
  }

  // 予約関連
  async getReservations(): Promise<ApiResponse<Reservation[]>> {
    return httpClient.get<ApiResponse<Reservation[]>>('/reservations')
  }



  async createReservation(data: CreateReservationRequest): Promise<{ success: boolean; error?: string }> {
    SharedSchemas.CreateReservationRequestSchema.parse(data)
    return httpClient.post<{ success: boolean; error?: string }>('/reservations', data)
  }

  async cancelReservation(reservationId: string): Promise<ApiResponse<void>> {
    return httpClient.post<ApiResponse<void>>(`/reservations/${reservationId}/cancel`)
  }

  // アーカイブ関連
  async getArchives(): Promise<ApiResponse<Archive[]>> {
    return httpClient.get<ApiResponse<Archive[]>>(`/archive`)
  }

  async createArchive(data: CreateArchiveRequest): Promise<ApiResponse<void>> {
    SharedSchemas.CreateArchiveRequestSchema.parse(data)
    return httpClient.post<ApiResponse<void>>(`/archive`, data)
  }

  async updateArchive(id: string, data: UpdateArchiveRequest): Promise<ApiResponse<void>> {
    SharedSchemas.UpdateArchiveRequestSchema.parse(data)
    return httpClient.put<ApiResponse<void>>(`/archive/${id}`, data)
  }

  async deleteArchive(id: string): Promise<ApiResponse<void>> {
    return httpClient.delete<ApiResponse<void>>(`/archive/${id}`)
  }

  async getEvents(): Promise<ApiResponse<Event[]>> {
    return httpClient.get<ApiResponse<Event[]>>(`/events`)
  }

  async createEvent(data: CreateEventRequest): Promise<ApiResponse<void>> {
    SharedSchemas.CreateEventRequestSchema.parse(data)
    return httpClient.post<ApiResponse<void>>(`/events`, data)
  }

  async updateEvent(id: string, data: UpdateEventRequest): Promise<ApiResponse<void>> {
    SharedSchemas.UpdateEventRequestSchema.parse(data)
    return httpClient.put<ApiResponse<void>>(`/events/${id}`, data)
  }

  async deleteEvent(id: string): Promise<ApiResponse<void>> {
    return httpClient.delete<ApiResponse<void>>(`/events/${id}`)
  }

  async getEntries(eventId?: string): Promise<ApiResponse<Entry[]>> {
    const params = eventId ? `?event_id=${eventId}` : ''
    return httpClient.get<ApiResponse<Entry[]>>(`/entries${params}`)
  }

  async createEntries(data: CreateEntryRequest): Promise<ApiResponse<void>> {
    SharedSchemas.CreateEntryRequestSchema.parse(data)
    return httpClient.post<ApiResponse<void>>(`/entries`, data)
  }

  async deleteEntry(id: string): Promise<ApiResponse<void>> {
    return httpClient.delete<ApiResponse<void>>(`/entries/${id}`)
  }

  async getSetlistItems(entryId: string): Promise<ApiResponse<Array<{ id: string; entry_id: string; position: number; title: string; artist: string; created_at: string; updated_at: string }>>> {
    return httpClient.get<ApiResponse<Array<{ id: string; entry_id: string; position: number; title: string; artist: string; created_at: string; updated_at: string }>>>(`/setlist/entry/${entryId}`)
  }

  async createSetlistItem(data: { entry_id: string; position: number; title: string; artist: string; admin?: boolean }): Promise<ApiResponse<void>> {
    return httpClient.post<ApiResponse<void>>(`/setlist`, data)
  }

  async updateSetlistItem(id: string, data: { position?: number; title?: string; artist?: string; admin?: boolean }): Promise<ApiResponse<void>> {
    return httpClient.put<ApiResponse<void>>(`/setlist/${id}`, data)
  }

  async deleteSetlistItem(id: string): Promise<ApiResponse<void>> {
    return httpClient.delete<ApiResponse<void>>(`/setlist/${id}`)
  }
}

export const apiClient = new ApiClient()