import { EventClient } from './event-client'
import { Event } from '@/app/types'
 

async function getServerEvents(): Promise<Event[]> {
  const cookieStore = await (await import('next/headers')).cookies()
  const cookieHeader = cookieStore.toString()
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL as string
  
  const response = await fetch(`${API_BASE_URL}/events`, {
    headers: {
      'Cookie': cookieHeader,
    },
  })

  if (!response.ok) {
    return []
  }

  const result = await response.json()
  return result.success ? result.data || [] : []
}

export default async function Page() {

  const events = await getServerEvents()

  return <EventClient initialEvents={events} />
}

