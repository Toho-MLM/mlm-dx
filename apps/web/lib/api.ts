import { MemberListItem } from '@/app/types'
import { z } from 'zod'
import { MemberListItemSchema } from './schemas'
import * as SharedSchemas from '../../../lib/shared-schemas'
import { httpClient } from './http-client'
import type { PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/types'

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
type EventSetlistBundleItem = SharedSchemas.EventSetlistBundleItem
type ReplaceSetlistItemsRequest = SharedSchemas.ReplaceSetlistItemsRequest
type TimelineItem = SharedSchemas.TimelineItem
type GetTimelineResponse = SharedSchemas.GetTimelineResponse
type UpdateTimelineRequest = SharedSchemas.UpdateTimelineRequest
type CreateEntryRequest = SharedSchemas.CreateEntryRequest
type UnavailablePeriod = SharedSchemas.UnavailablePeriod
type CreateUnavailablePeriodRequest = SharedSchemas.CreateUnavailablePeriodRequest
type ApiResponse<T> = SharedSchemas.ApiResponse<T>
export type PasskeyCredential = {
  id: string
  credential_id: string
  device_type: string | null
  backed_up: boolean
  transports: string[]
  attestation_format: string | null
  created_at: string
  updated_at: string
}
type PasskeyRegistrationStartResponse = { challengeId: string; options: PublicKeyCredentialCreationOptionsJSON }
type PasskeyLoginStartResponse = { success: true; challengeId: string; options: PublicKeyCredentialRequestOptionsJSON } | { success: false }

class ApiClient {

  async checkFirstUser(): Promise<{ canCreate: boolean }> {
    return httpClient.get<{ canCreate: boolean }>('/auth/check-first-user')
  }

  async createFirstUser(data: {
    name: string;
    email: string;
    grade: number;
  }): Promise<ApiResponse<void>> {
    return httpClient.post<ApiResponse<void>>('/auth/create-first-user', data)
  }

  async getPasskeyStatus(): Promise<{ success: boolean; registered: boolean }> {
    return httpClient.get<{ success: boolean; registered: boolean }>('/auth/passkey/status')
  }

  async startPasskeyRegistration(): Promise<PasskeyRegistrationStartResponse> {
    return httpClient.post<PasskeyRegistrationStartResponse>('/auth/passkey/register/start')
  }

  async finishPasskeyRegistration(challengeId: string, response: any): Promise<{ success: boolean }> {
    return httpClient.post<{ success: boolean }>('/auth/passkey/register/finish', { challengeId, response })
  }

  async startPasskeyLogin(): Promise<PasskeyLoginStartResponse> {
    return httpClient.post<PasskeyLoginStartResponse>('/auth/passkey/login/options')
  }

  async finishPasskeyLogin(challengeId: string, response: any): Promise<{ success: boolean }> {
    return httpClient.post<{ success: boolean }>('/auth/passkey/login/finish', { challengeId, response })
  }

  async getPasskeyCredentials(): Promise<{ success: boolean; passkeys: PasskeyCredential[] }> {
    return httpClient.get<{ success: boolean; passkeys: PasskeyCredential[] }>('/auth/passkey/credentials')
  }

  async deletePasskeyCredential(id: string): Promise<{ success: boolean }> {
    return httpClient.delete<{ success: boolean }>(`/auth/passkey/credentials/${id}`)
  }

  // ユーザー関連
  async getCurrentUserData(): Promise<ApiResponse<User>> {
    return httpClient.get<ApiResponse<User>>(`/me`)
  }

  async updateUserData(data: UpdateUserRequest): Promise<ApiResponse<void>> {
    SharedSchemas.UpdateUserRequestSchema.parse(data)
    return httpClient.put<ApiResponse<void>>('/me', data)
  }

  async resetAvatar(): Promise<ApiResponse<void>> {
    return httpClient.post<ApiResponse<void>>('/me/avatar/reset')
  }

  async getUserGroups(admin: boolean = false): Promise<ApiResponse<Group[]>> {
    const params = admin ? '?admin=true' : '';
    return httpClient.get<ApiResponse<Group[]>>(`/groups${params}`)
  }

  async getGroupOptions(admin: boolean = false): Promise<ApiResponse<{ id: string; name: string; is_main: boolean }[]>> {
    const params = admin ? '?admin=true' : '';
    return httpClient.get<ApiResponse<{ id: string; name: string; is_main: boolean }[]>>(`/me/groups/select${params}`)
  }

  async getMemberOptions(): Promise<ApiResponse<{ id: string; name: string; instruments: string[] }[]>> {
    return httpClient.get<ApiResponse<{ id: string; name: string; instruments: string[] }[]>>('/members/select')
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
  async getReservations(admin: boolean = false): Promise<ApiResponse<Reservation[]>> {
    const params = admin ? '?admin=true' : '';
    return httpClient.get<ApiResponse<Reservation[]>>(`/reservations${params}`)
  }



  async createReservation(data: CreateReservationRequest): Promise<{ success: boolean; error?: string }> {
    SharedSchemas.CreateReservationRequestSchema.parse(data)
    try {
      return await httpClient.post<{ success: boolean; error?: string }>('/reservations', data)
    } catch (error) {
      if (error instanceof Error) {
        return { success: false, error: error.message }
      }
      return { success: false, error: 'UNKNOWN_ERROR' }
    }
  }

  async cancelReservation(reservationId: string, admin: boolean = false): Promise<ApiResponse<void>> {
    const params = admin ? '?admin=true' : '';
    return httpClient.post<ApiResponse<void>>(`/reservations/${reservationId}/cancel${params}`)
  }

  async getUnavailablePeriods(): Promise<ApiResponse<UnavailablePeriod[]>> {
    return httpClient.get<ApiResponse<UnavailablePeriod[]>>('/reservations/unavailable')
  }

  async createUnavailablePeriod(data: CreateUnavailablePeriodRequest): Promise<ApiResponse<void>> {
    SharedSchemas.CreateUnavailablePeriodRequestSchema.parse(data)
    return httpClient.post<ApiResponse<void>>('/reservations/unavailable', data)
  }

  async deleteUnavailablePeriod(id: string): Promise<ApiResponse<void>> {
    return httpClient.delete<ApiResponse<void>>(`/reservations/unavailable/${id}`)
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

  async updateEntry(id: string, data: { note: string | null }): Promise<ApiResponse<void>> {
    SharedSchemas.UpdateEntryRequestSchema.parse(data)
    return httpClient.put<ApiResponse<void>>(`/entries/${id}`, data)
  }

  async getSetlistItems(entryId: string): Promise<ApiResponse<Array<{ id: string; entry_id: string; position: number; title: string; artist: string; created_at: string; updated_at: string }>>> {
    return httpClient.get<ApiResponse<Array<{ id: string; entry_id: string; position: number; title: string; artist: string; created_at: string; updated_at: string }>>>(`/setlist/entry/${entryId}`)
  }

  async getEventSetlist(eventId: string): Promise<ApiResponse<EventSetlistBundleItem[]>> {
    return httpClient.get<ApiResponse<EventSetlistBundleItem[]>>(`/setlist/event/${eventId}`)
  }

  async getTimeline(eventId: string): Promise<ApiResponse<GetTimelineResponse>> {
    return httpClient.get<ApiResponse<GetTimelineResponse>>(`/timeline/event/${eventId}`)
  }

  async updateTimeline(eventId: string, payload: UpdateTimelineRequest): Promise<ApiResponse<void>> {
    return httpClient.put<ApiResponse<void>>(`/timeline/event/${eventId}` , payload)
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

  async replaceSetlistItems(entryId: string, items: ReplaceSetlistItemsRequest['items'], hasSE: boolean, admin?: boolean): Promise<ApiResponse<void>> {
    const body: ReplaceSetlistItemsRequest = { items, hasSE, admin }
    return httpClient.put<ApiResponse<void>>(`/setlist?entryId=${entryId}`, body)
  }
}

export const apiClient = new ApiClient()