import { Suspense } from 'react'
import { SetlistPageClient } from './setlist-page-client'

export default function Page() {
  return (
    <Suspense fallback={null}>
      <SetlistPageClient />
    </Suspense>
  )
}


