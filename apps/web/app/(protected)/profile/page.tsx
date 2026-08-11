import type { UserWithInstruments } from '@shared-schemas'
import { Instrument, Role, type UserData } from '@/app/types'
import type { EmailNotificationPreferences, PasskeyCredential } from '@/lib/api'
import { ProfileClient, type ProfileInitialData } from './profile-client'
import { serverRequest, settleServerRequest, type ApiResponse } from '@/lib/server-api'

export default async function ProfilePage() {
  const [profile, passkeys, preferences] = await Promise.all([
    settleServerRequest(serverRequest<ApiResponse<UserWithInstruments>>('/me')),
    settleServerRequest(serverRequest<{ success: boolean; passkeys: PasskeyCredential[] }>('/auth/passkey/credentials')),
    settleServerRequest(serverRequest<ApiResponse<EmailNotificationPreferences>>('/me/email-notification-preferences')),
  ])
  const rawProfile = profile?.success ? profile.data : null
  const userData: UserData | null = rawProfile ? {
    grade: rawProfile.grade,
    name: rawProfile.name,
    role: rawProfile.role as Role,
    email: rawProfile.email,
    nickname: rawProfile.nickname,
    instruments: rawProfile.instruments as Instrument[],
    student_number: rawProfile.student_number,
  } : null
  const initialData: ProfileInitialData = {
    profile: userData,
    passkeys: passkeys?.success ? passkeys.passkeys : null,
    emailPreferences: preferences?.success ? preferences.data ?? null : null,
  }

  return <ProfileClient initialData={initialData} />
}
