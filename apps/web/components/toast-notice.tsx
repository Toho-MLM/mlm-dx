'use client'

import { useEffect, useId, useRef } from 'react'
import { toast } from '@/lib/toast'
import { Button } from '@/components/ui/button'

/** Render notifications through the root toaster, including conditional load errors. */
export function ToastNotice({ message, description, variant = 'error', retry }: {
  message: string
  description?: string
  variant?: 'error' | 'warning' | 'info'
  retry?: () => void
}) {
  const id = useId()
  const latest = useRef(retry)
  latest.current = retry
  useEffect(() => {
    toast[variant](message, {
      id,
      description,
      duration: variant === 'info' ? 5000 : Infinity,
      action: latest.current ? { label: '再読み込み', onClick: () => latest.current?.() } : undefined,
    })
    return () => { toast.dismiss(id) }
  }, [id, message, description, variant])
  // Keep recovery available after the user dismisses the notification.
  return retry ? <Button type="button" variant="outline" onClick={retry}>再読み込み</Button> : null
}
