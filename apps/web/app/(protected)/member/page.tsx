import type { MemberListItem } from '@/app/types'
import { MemberClient } from './member-client'
import { serverRequest, settleServerRequest, type ApiResponse } from '@/lib/server-api'

export default async function MemberPage() {
  const response = await settleServerRequest(serverRequest<ApiResponse<MemberListItem[]>>('/members'))
  return <MemberClient initialMembers={response?.success ? response.data ?? [] : null} />
}
