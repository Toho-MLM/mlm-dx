import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { toast } from "sonner"
import type { Group } from '@/app/types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatGroups(raw: any[]): Group[] {
  return (raw || []).map((group: any) => ({
    id: group.id,
    name: group.name,
    isMain: group.is_main,
    isActive: group.is_active,
    assignments: group.assignments || [],
  }))
}

type SuccessToastParams = {
  message: string
  description?: string
}

export function showSuccessToast(params: SuccessToastParams) {
  toast.success(params.message, {
    description: params.description,
  })
}
