import type { External } from '@shared-schemas'
import { ExternalStudiosClient } from './external-studios-client'
import { serverRequest, settleServerRequest, type ApiResponse } from '@/lib/server-api'

export default async function ExternalStudiosPage() {
  const response = await settleServerRequest(serverRequest<ApiResponse<External[]>>('/reservation/external/studios'))
  return <ExternalStudiosClient initialExternals={response?.success ? response.data ?? [] : null} />
}
