import { getServerUser } from '@/lib/server-api'
import { redirect } from 'next/navigation'

export default async function Page() {
  const user = await getServerUser()
  
  if (!user) {
    redirect('/login')
  }
  
  redirect('/reservation')
}
