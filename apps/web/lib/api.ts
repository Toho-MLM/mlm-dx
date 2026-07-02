import { MemberListItem } from '@/app/types'
import * as SharedSchemas from '../../../lib/shared-schemas'
import { httpClient } from './http-client'
import type { PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON, AuthenticatorAttestationResponseJSON, AuthenticatorAssertionResponseJSON } from '@simplewebauthn/types'

type User = SharedSchemas.User
type Group = SharedSchemas.Group
type Reservation = SharedSchemas.Reservation
type ReservationLimit = SharedSchemas.ReservationLimit
type ReservationLimitRemaining = SharedSchemas.ReservationLimitRemaining
type ReservationLimitScope = SharedSchemas.ReservationLimitScope
type Archive = SharedSchemas.Archive
type CreateGroupRequest = SharedSchemas.CreateGroupRequest
type UpdateGroupRequest = SharedSchemas.UpdateGroupRequest
type UpdateUserRequest = SharedSchemas.UpdateUserRequest
type CreateReservationRequest = SharedSchemas.CreateReservationRequest
type CreateReservationLimitRequest = SharedSchemas.CreateReservationLimitRequest
type UpdateReservationLimitRequest = SharedSchemas.UpdateReservationLimitRequest
type CreateArchiveRequest = SharedSchemas.CreateArchiveRequest
type UpdateArchiveRequest = SharedSchemas.UpdateArchiveRequest
type Event = SharedSchemas.Event
type CreateEventRequest = SharedSchemas.CreateEventRequest
type UpdateEventRequest = SharedSchemas.UpdateEventRequest
type Entry = SharedSchemas.Entry
type EventSetlistBundleItem = SharedSchemas.EventSetlistBundleItem
type ReplaceSetlistItemsRequest = SharedSchemas.ReplaceSetlistItemsRequest
type GetTimelineResponse = SharedSchemas.GetTimelineResponse
type UpdateTimelineRequest = SharedSchemas.UpdateTimelineRequest
type CreateEntryRequest = SharedSchemas.CreateEntryRequest
type UnavailablePeriod = SharedSchemas.UnavailablePeriod
type CreateUnavailablePeriodRequest = SharedSchemas.CreateUnavailablePeriodRequest
type ApiResponse<T> = SharedSchemas.ApiResponse<T>
export type BandDraftState = {
  columns: Array<{ id: string; name: string }>
  cells: Record<string, Record<string, string[]>>
  unassignedMemberIds: string[]
  version: number
}
export type BandDraftMember = { id: string; name: string; instruments: string[] }
export type BandMainDraft = {
  id: string
  shareToken: string
  state: BandDraftState
  members: BandDraftMember[]
  canFinalize: boolean
  canDelete: boolean
  updatedAt: string
}
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
  private getBaseUrl(): string {
    return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787'
  }

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

  async finishPasskeyRegistration(challengeId: string, response: AuthenticatorAttestationResponseJSON): Promise<{ success: boolean }> {
    return httpClient.post<{ success: boolean }>('/auth/passkey/register/finish', { challengeId, response })
  }

  async startPasskeyLogin(): Promise<PasskeyLoginStartResponse> {
    return httpClient.post<PasskeyLoginStartResponse>('/auth/passkey/login/options')
  }

  async finishPasskeyLogin(challengeId: string, response: AuthenticatorAssertionResponseJSON): Promise<{ success: boolean }> {
    return httpClient.post<{ success: boolean }>('/auth/passkey/login/finish', { challengeId, response })
  }

  async getPasskeyCredentials(): Promise<{ success: boolean; passkeys: PasskeyCredential[] }> {
    return httpClient.get<{ success: boolean; passkeys: PasskeyCredential[] }>('/auth/passkey/credentials')
  }

  async deletePasskeyCredential(id: string): Promise<{ success: boolean }> {
    return httpClient.delete<{ success: boolean }>(`/auth/passkey/credentials/${id}`)
  }

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

  async createBandMainDraft(): Promise<ApiResponse<{ shareToken: string }>> {
    return httpClient.post<ApiResponse<{ shareToken: string }>>('/band/main/draft')
  }

  async getBandMainDraft(token: string): Promise<ApiResponse<BandMainDraft>> {
    return httpClient.get<ApiResponse<BandMainDraft>>(`/band/main/draft/${token}`)
  }

  async finalizeBandMainDraft(token: string): Promise<ApiResponse<{ createdCount: number }>> {
    return httpClient.post<ApiResponse<{ createdCount: number }>>(`/band/main/draft/${token}/finalize`)
  }

  async deleteBandMainDraft(token: string): Promise<ApiResponse<void>> {
    return httpClient.delete<ApiResponse<void>>(`/band/main/draft/${token}`)
  }

  getBandMainDraftWebSocketUrl(token: string): string {
    const apiUrl = new URL(this.getBaseUrl())
    apiUrl.protocol = apiUrl.protocol === 'https:' ? 'wss:' : 'ws:'
    apiUrl.pathname = `/band/main/draft/${token}/ws`
    apiUrl.search = ''
    return apiUrl.toString()
  }

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

  async moveUpGrade(): Promise<ApiResponse<{ deletedCount: number; movedUpCount: number }>> {
    return httpClient.post<ApiResponse<{ deletedCount: number; movedUpCount: number }>>('/members/move-up-grade')
  }

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

  async getReservationLimits(): Promise<ApiResponse<ReservationLimit[]>> {
    return httpClient.get<ApiResponse<ReservationLimit[]>>('/reservations/limits')
  }

  async getReservationLimitRemaining(scope: ReservationLimitScope, targetId: string, referenceTime?: string): Promise<ApiResponse<ReservationLimitRemaining[]>> {
    const params = new URLSearchParams({ scope, target_id: targetId })
    if (referenceTime) {
      params.set('reference_time', referenceTime)
    }
    return httpClient.get<ApiResponse<ReservationLimitRemaining[]>>(`/reservations/limits/remaining?${params.toString()}`)
  }

  async createReservationLimit(data: CreateReservationLimitRequest): Promise<ApiResponse<void>> {
    SharedSchemas.CreateReservationLimitRequestSchema.parse(data)
    return httpClient.post<ApiResponse<void>>('/reservations/limits', data)
  }

  async updateReservationLimit(id: string, data: UpdateReservationLimitRequest): Promise<ApiResponse<void>> {
    SharedSchemas.UpdateReservationLimitRequestSchema.parse(data)
    return httpClient.put<ApiResponse<void>>(`/reservations/limits/${id}`, data)
  }

  async deleteReservationLimit(id: string): Promise<ApiResponse<void>> {
    return httpClient.delete<ApiResponse<void>>(`/reservations/limits/${id}`)
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

  async createEntries(data: CreateEntryRequest, admin?: boolean): Promise<ApiResponse<void>> {
    const requestData = { ...data, admin: admin === true ? true : undefined }
    SharedSchemas.CreateEntryRequestSchema.parse(requestData)
    return httpClient.post<ApiResponse<void>>(`/entries`, requestData)
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

  async getEventSetlist(eventId: string, admin: boolean = false): Promise<ApiResponse<EventSetlistBundleItem[]>> {
    const params = admin ? '?admin=true' : '';
    return httpClient.get<ApiResponse<EventSetlistBundleItem[]>>(`/setlist/event/${eventId}${params}`)
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
