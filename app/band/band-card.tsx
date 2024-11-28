import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Group, instrumentColors, Member } from "@/app/types"

interface BandCardProps {
  band: Group
  members: Member[]
  onEdit: (id: string) => void
}

export function BandCard({ band, members, onEdit }: BandCardProps) {
  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{band.name}</CardTitle>
          <Badge variant={band.isMain ? "default" : "secondary"}>
            {band.isMain ? "本バンド" : "自由バンド"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {band.assignments.map((bandMember) => {
            const member = members.find(m => m.id === bandMember.id)
            return (
              <li key={bandMember.id} className="flex justify-between items-center">
                <span className="font-medium">{member?.name}</span>
                <div className="flex gap-1">
                  {bandMember.instruments.map((instrument) => (
                    <Badge key={instrument} className={instrumentColors[instrument]}>
                      {instrument}
                    </Badge>
                  ))}
                </div>
              </li>
            )
          })}
        </ul>
        <button
          onClick={() => onEdit(band.id)}
          className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
        >
          編集
        </button>
      </CardContent>
    </Card>
  )
}

