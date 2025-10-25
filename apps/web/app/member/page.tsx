import { MemberList } from './member-list'
import { getServerUser, getServerMemberList } from '@/lib/server-api'
import { redirect } from 'next/navigation'
import ErrorAlert from '@/components/errorAlert';

export default async function Page() {
  const user = await getServerUser()
  
  if (!user) {
    redirect('/login')
  }
  
  const memberResponse = await getServerMemberList();

  if (!memberResponse.success || !memberResponse.data) {
    return <ErrorAlert error={'メンバーリストの取得中にエラーが発生しました。' + (memberResponse.error || '')} />
  }

  return <MemberList memberData={memberResponse.data} />
}
