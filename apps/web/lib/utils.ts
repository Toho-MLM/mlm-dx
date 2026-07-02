import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { toast } from "sonner"
import type { Group } from '@/app/types'
import { compareInstruments, Instrument } from '@/app/types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatGroups(raw: unknown[]): Group[] {
  return (raw || []).map((group: unknown) => {
    const g = group as { 
      id: string
      name: string
      is_main?: boolean
      is_active?: boolean
      assignments?: Array<{ id: string; instruments: string[] }>
    }
    return {
      id: g.id,
      name: g.name,
      isMain: g.is_main ?? false,
      isActive: g.is_active ?? false,
      assignments: (g.assignments || []).map(assignment => ({
        id: assignment.id,
        instruments: [...assignment.instruments].sort(compareInstruments) as Instrument[],
      })),
    }
  }).sort((a, b) => a.name.localeCompare(b.name, 'ja'))
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
