'use client'

import { Switch } from '@/components/ui/switch'

type AdminModeToggleProps = {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}

export function AdminModeToggle({ checked, onCheckedChange }: AdminModeToggleProps) {
  return (
    <div className="flex w-full items-center justify-between gap-2">
      <span className="text-left text-sm text-gray-600">管理者モード</span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  )
}
