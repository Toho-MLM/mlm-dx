import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
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
