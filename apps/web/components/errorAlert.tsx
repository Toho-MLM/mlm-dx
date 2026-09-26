'use client'

import { ToastNotice } from '@/components/toast-notice'

export default function ErrorAlert({ error }: { error: string }) {
  return <ToastNotice message={error} />
}
