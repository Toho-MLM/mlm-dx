import { Badge } from "@/components/ui/badge"
import { Group, instrumentColors, instrumentNames } from "@/app/types"
import { Button } from "@/components/ui/button"
import { MoreVertical } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"

interface BandCardProps {
  band: Group
  memberOptions?: { id: string; name: string; instruments: string[] }[]
  onEdit: (id: string) => void
  onToggleActive?: (id: string) => void
  isAdminMode?: boolean
  loading?: boolean
}

export function BandCard({ band, memberOptions = [], onEdit, onToggleActive, isAdminMode = false, loading = false }: BandCardProps) {
  return (
    <div className={`grid w-full grid-cols-[1fr_auto] items-center gap-x-2 rounded-md border px-3 py-2.5 transition-colors sm:grid-cols-[minmax(150px,220px)_1fr_auto] sm:gap-x-3 ${band.isActive ? 'bg-white hover:bg-gray-50' : 'bg-gray-50 opacity-70'}`}>
      <div className="min-w-0 pr-1">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-4 w-24" />
          </div>
        ) : (
          <>
            <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
              <div className="truncate text-sm font-semibold leading-5">{band.name}</div>
              <Badge
                className="h-5 shrink-0 px-1.5 text-[11px] font-medium"
                variant={band.isMain ? "default" : "secondary"}
              >
                {band.isMain ? "本バンド" : "自由バンド"}
              </Badge>
            </div>
            {!band.isActive && (
              <div className="mt-1.5 flex">
                <Badge className="h-5 px-1.5 text-[11px] font-medium" variant="outline">
                  無効
                </Badge>
              </div>
            )}
          </>
        )}
      </div>

      <div className="col-span-2 min-w-0 sm:col-span-1 sm:col-start-2 sm:row-start-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          {loading ? (
            [0, 1, 2].map((i) => (
              <div key={i} className="flex h-7 items-center gap-2 rounded-md border px-2">
                <Skeleton className="h-4 w-12 rounded" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))
          ) : band.assignments.length > 0 ? (
            band.assignments.map((bandMember, index) => {
              const memberOption = memberOptions?.find(m => m.id === bandMember.id)
              return (
                <div
                  key={`${bandMember.id}-${index}`}
                  className="flex min-w-0 max-w-full flex-wrap items-center gap-x-1.5 gap-y-1 rounded-md border bg-white px-2 py-1.5"
                >
                  <div className="flex shrink-0 flex-wrap gap-1">
                    {bandMember.instruments.map((instrument) => (
                      <Badge
                        key={instrument}
                        variant="secondary"
                        className={`h-5 px-1.5 text-[11px] leading-none ${instrumentColors[instrument]}`}
                      >
                        {instrumentNames[instrument]}
                      </Badge>
                    ))}
                  </div>
                  <span className="min-w-0 truncate text-xs font-medium">
                    {memberOption?.name || `不明なメンバー (${bandMember.id})`}
                  </span>
                </div>
              )
            })
          ) : (
            <div className="text-sm text-muted-foreground">メンバー未設定</div>
          )}
        </div>
      </div>

      <div className="col-start-2 row-start-1 flex shrink-0 justify-end sm:col-start-3">
        {!loading && !(band.isMain && !isAdminMode) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                aria-label={`${band.name}の操作`}
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {band.isActive ? (
                <>
                  <DropdownMenuItem
                    onClick={() => onEdit(band.id)}
                    className="flex items-center gap-2"
                  >
                    編集
                  </DropdownMenuItem>
                  {onToggleActive && (
                    <DropdownMenuItem
                      onClick={() => onToggleActive(band.id)}
                      className="flex items-center gap-2"
                    >
                      無効化
                    </DropdownMenuItem>
                  )}
                </>
              ) : (
                onToggleActive && (
                  <DropdownMenuItem
                    onClick={() => onToggleActive(band.id)}
                    className="flex items-center gap-2"
                  >
                    有効化
                  </DropdownMenuItem>
                )
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  )
}
