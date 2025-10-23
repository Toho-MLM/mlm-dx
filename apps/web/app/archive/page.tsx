import { getServerUser, getServerArchives } from '@/lib/server-api'
import { ArchiveClient } from './archive-client'
import { redirect } from 'next/navigation'

export default async function Page() {
  const user = await getServerUser()
  
  if (!user) {
    redirect('/login')
  }
  
  const archivesResponse = await getServerArchives()
  
  if (!archivesResponse.success) {
    return <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">アーカイブ</h1>
      <p className="text-red-600">データの取得に失敗しました: {archivesResponse.error}</p>
    </div>
  }

  const archives = archivesResponse.data || []

  return <ArchiveClient initialArchives={archives} />
}