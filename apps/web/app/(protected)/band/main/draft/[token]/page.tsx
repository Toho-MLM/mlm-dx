import { BandMainDraftBoard } from './band-main-draft-board'
import type { BandMainDraft } from '@/lib/api'
import { serverRequest, settleServerRequest, type ApiResponse } from '@/lib/server-api'

export default async function Page({ params }: { params: { token: string } }) {
  const response = await settleServerRequest(serverRequest<ApiResponse<BandMainDraft>>(`/band/main/draft/${params.token}`))
  return <BandMainDraftBoard token={params.token} initialDraft={response?.success ? response.data ?? null : null} />
}
