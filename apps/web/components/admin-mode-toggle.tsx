'use client'

import { Switch } from '@/components/ui/switch'

type AdminModeToggleProps = {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}

export function AdminModeToggle({ checked, onCheckedChange }: AdminModeToggleProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-gray-600">管理者モード</span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  )
}
