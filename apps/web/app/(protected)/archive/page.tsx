import type { Archive } from '@shared-schemas'
import { ArchiveClient } from './archive-client'
import { serverRequest, settleServerRequest, type ApiResponse } from '@/lib/server-api'

export default async function ArchivePage() {
  const response = await settleServerRequest(serverRequest<ApiResponse<Archive[]>>('/archive'))
  return <ArchiveClient initialArchives={response?.success ? response.data ?? [] : null} />
}
