import { Suspense } from 'react'
import { TimelinePageClient } from './timeline-page-client'

export default function Page() {
  return (
    <Suspense fallback={null}>
      <TimelinePageClient />
    </Suspense>
  )
}


