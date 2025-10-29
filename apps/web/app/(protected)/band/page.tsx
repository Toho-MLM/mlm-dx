import { BandList } from './band-list'
import { Group, Member, Instrument } from '@/app/types'
import { requireAuth, getServerUserGroups, getServerMemberOptions } from '@/lib/server-api'
import ErrorAlert from '@/components/errorAlert';

export default async function Page() {
  await requireAuth()
  
  const [groupResponse, memberOptionsResponse] = await Promise.all([
    getServerUserGroups(),
    getServerMemberOptions()
  ]);

  if (!groupResponse.success || !memberOptionsResponse.success) {
    return <ErrorAlert error={'データの取得中にエラーが発生しました。' + (groupResponse.error || memberOptionsResponse.error || '')} />
  }

  const formattedGroupData: Group[] = (groupResponse.data as any[]).map((group: any) => {
    return {
      id: group.id,
      name: group.name,
      isMain: group.is_main,
      isActive: group.is_active,
      assignments: group.assignments || []
    };
  });

  return <BandList bands={formattedGroupData} memberOptions={memberOptionsResponse.data || []} />
}
