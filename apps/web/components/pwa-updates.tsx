'use client'

import { useEffect } from 'react'
import { toast } from '@/lib/toast'
import { registerPwa } from '@/lib/pwa'

const toastId = 'pwa-update'

export function PwaUpdates() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return

    return registerPwa({
      onUpdateReady: (reload) => {
        toast('新しいバージョンを利用できます', {
          id: toastId,
          description: '入力内容を保存してから再読み込みしてください。',
          duration: Infinity,
          action: {
            label: '再読み込み',
            onClick: (event) => {
              // Applying can synchronously replace this toast with an error.
              event.preventDefault()
              reload()
            },
          },
        })
      },
      onUpdateError: (retry) => {
        toast.error('更新できませんでした', {
          id: toastId,
          description: '通信状況を確認して、もう一度お試しください。',
          duration: Infinity,
          action: {
            label: '再試行',
            onClick: (event) => {
              event.preventDefault()
              retry()
            },
          },
        })
      },
    })
  }, [])

  return null
}
