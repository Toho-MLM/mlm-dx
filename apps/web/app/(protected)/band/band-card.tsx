import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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

interface BandCardProps {
  band: Group
  memberOptions?: { id: string; name: string; instruments: string[] }[]
  onEdit: (id: string) => void
  onToggleActive?: (id: string) => void
  isAdminMode?: boolean
}

export function BandCard({ band, memberOptions = [], onEdit, onToggleActive, isAdminMode = false }: BandCardProps) {
  return (
    <Card className={`w-full max-w-md transition-shadow duration-200 ${band.isActive ? 'hover:shadow-lg' : 'opacity-60 bg-gray-50'}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl font-bold">{band.name}</CardTitle>
          <div className="flex items-center gap-2">
            <Badge 
              className="py-1 px-2 text-xs font-medium" 
              variant={band.isMain ? "default" : "secondary"}
            >
              {band.isMain ? "本バンド" : "自由バンド"}
            </Badge>
            {!(band.isMain && !isAdminMode) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    className="h-6 w-6 p-0"
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
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-3">
          <div className="space-y-2">
            <div className="space-y-2">
              {band.assignments.map((bandMember, index) => {
                const memberOption = memberOptions?.find(m => m.id === bandMember.id)
                return (
                  <div 
                    key={`${bandMember.id}-${index}`} 
                    className="flex items-center space-x-2 p-2 border rounded"
                  >
                    <span className="flex-grow font-medium">{memberOption?.name || `不明なメンバー (${bandMember.id})`}</span>
                    <div className="flex items-center space-x-1">
                      {bandMember.instruments.map((instrument) => (
                        <Badge
                          key={instrument}
                          variant="secondary"
                          className={`text-sm ${instrumentColors[instrument]}`}
                        >
                          {instrumentNames[instrument]}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

