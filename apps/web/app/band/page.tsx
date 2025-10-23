import { BandList } from './band-list'
import { Group, Member, Instrument } from '@/app/types'
import { getServerUser, getServerUserGroups, getServerMembers } from '@/lib/server-api'
import { redirect } from 'next/navigation'
import ErrorAlert from '@/components/errorAlert';

export default async function Page() {
  const user = await getServerUser()
  
  if (!user) {
    redirect('/login')
  }
  
  const [groupResponse, memberResponse] = await Promise.all([
    getServerUserGroups(),
    getServerMembers()
  ]);

  if (!groupResponse.success || !memberResponse.success) {
    return <ErrorAlert error={'データの取得中にエラーが発生しました。' + (groupResponse.error || memberResponse.error || '')} />
  }

  const formattedGroupData: Group[] = (groupResponse.data as any[]).map((group: any) => {
    return {
      id: group.id,
      name: group.name,
      isMain: group.is_main,
      assignments: group.assignments ? Object.entries(group.assignments).map(([instrument, userId]) => ({
        id: userId as string,
        instruments: [instrument as Instrument]
      })) : []
    };
  });

  return <BandList bands={formattedGroupData} members={memberResponse.data as Member[]} />
}
