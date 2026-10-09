import { cookies } from 'next/headers'
import type { ReactNode } from 'react'
import { SidebarLayout } from '../../layout-client'

export default async function SupportLayout({ children }: { children: ReactNode }) {
  const adminMode = (await cookies()).get('mlm-dx-admin-mode')?.value === 'true'

  return <SidebarLayout publicAccess initialAdminMode={adminMode}>{children}</SidebarLayout>
}
