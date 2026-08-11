import type { DashboardData } from '@shared-schemas'
import { DashboardClient } from './dashboard-client'
import { serverRequest, settleServerRequest, type ApiResponse } from '@/lib/server-api'

export default async function DashboardPage() {
  const response = await settleServerRequest(serverRequest<ApiResponse<DashboardData>>('/dashboard'))
  return <DashboardClient initialData={response?.success ? response.data ?? null : null} />
}
