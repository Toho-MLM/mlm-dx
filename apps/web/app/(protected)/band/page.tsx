import { BandList } from './band-list'
import { getServerAdminMode, requireAuth, serverRequest, settleServerRequest, type ApiResponse } from '@/lib/server-api'

type MemberOption = { id: string; name: string; display_name?: string; real_name?: string; instruments: string[] }

export default async function Page() {
  const user = await requireAuth()
  const adminMode = await getServerAdminMode(user)
  const [groups, members] = await Promise.all([
    settleServerRequest(serverRequest<ApiResponse<unknown[]>>(`/groups${adminMode ? '?admin=true' : ''}`)),
    settleServerRequest(serverRequest<ApiResponse<MemberOption[]>>('/members/select')),
  ])

  return (
    <BandList
      initialGroups={groups?.success ? groups.data ?? [] : null}
      initialMembers={members?.success ? members.data ?? [] : null}
      initialAdminMode={adminMode}
    />
  )
}
