import type { HTMLAttributes } from 'react'
import { badgeVariants, type BadgeProps } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

type BandTypeBadgeProps = Omit<HTMLAttributes<HTMLSpanElement>, 'children'> & {
  mainIndex: number | null
  freeVariant?: BadgeProps['variant']
}

export function BandTypeBadge({ mainIndex, freeVariant = 'outline', className, ...props }: BandTypeBadgeProps) {
  return (
    <span
      {...props}
      className={cn(badgeVariants({ variant: mainIndex === null ? freeVariant : 'default' }), 'shrink-0 whitespace-nowrap', className)}
    >
      {mainIndex === null ? '自由バンド' : `本バンド${mainIndex + 1}`}
    </span>
  )
}
