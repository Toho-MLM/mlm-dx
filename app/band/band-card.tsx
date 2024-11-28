import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Group, instrumentColors, Member } from "@/app/types"
import { Button } from "@/components/ui/button"

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
          <CardTitle className="text-xl">{band.name}</CardTitle>
          <Badge className="py-2 px-3" variant={band.isMain ? "default" : "secondary"}>
            {band.isMain ? "本バンド" : "自由バンド"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
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
          <div className="flex items-center justify-between">
            <Button className="bg-red-500 text-white hover:bg-red-600" disabled={band.isMain}>
              削除
            </Button>
            <Button
              onClick={() => onEdit(band.id)}
              className="bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
              disabled={band.isMain}
            >
              編集
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

