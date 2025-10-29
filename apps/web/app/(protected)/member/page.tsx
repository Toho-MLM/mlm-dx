import { MemberList } from './member-list'
import { getServerMemberList } from '@/lib/server-api'
import ErrorAlert from '@/components/errorAlert';

export default async function Page() {
  
  const memberResponse = await getServerMemberList();

  if (!memberResponse.success || !memberResponse.data) {
    return <ErrorAlert error={'メンバーリストの取得中にエラーが発生しました。' + (memberResponse.error || '')} />
  }

  return <MemberList memberData={memberResponse.data} />
}
