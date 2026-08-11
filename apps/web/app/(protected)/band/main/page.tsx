import { BandMainClient } from './band-main-client'
import { serverRequest, settleServerRequest, type ApiResponse } from '@/lib/server-api'

type MemberOption = { id: string; name: string; display_name?: string; real_name?: string; instruments: string[] }

export default async function BandMainPage() {
  const [groups, members] = await Promise.all([
    settleServerRequest(serverRequest<ApiResponse<unknown[]>>('/groups?main=true')),
    settleServerRequest(serverRequest<ApiResponse<MemberOption[]>>('/members/select')),
  ])

  return (
    <BandMainClient
      initialGroups={groups?.success ? groups.data ?? [] : null}
      initialMembers={members?.success ? members.data ?? [] : null}
    />
  )
}
