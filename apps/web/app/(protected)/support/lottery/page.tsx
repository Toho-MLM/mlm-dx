import { AlertCircleIcon, Clock3Icon, DoorOpenIcon, ScaleIcon } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const thClass = 'bg-muted px-3 py-2 text-left align-top font-semibold';
const tdClass = 'border-t px-3 py-2 align-top';

export default function LotterySupportPage() {
  return (
    <>
      <PageHeader />
      <main className="mx-auto w-full max-w-4xl space-y-4 p-4 pt-0">
        <Alert>
          <Clock3Icon className="h-4 w-4" />
          <AlertTitle>抽選は各利用対象日の前日21:00に実施されます</AlertTitle>
          <AlertDescription>
            外部抽選は翌日から14日先までの時間枠に申し込めます。日付をまたぐ時間枠には、まだ終了していない抽選日時がすべて表示されます。抽選後の空き部屋は「外部予約」から先着順で予約してください。
          </AlertDescription>
        </Alert>

        <Card>
          <CardHeader>
            <CardTitle>申し込み方法</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-relaxed text-foreground">
            <ol className="list-decimal space-y-2 pl-5">
              <li>「外部抽選」で「申込」を押します。</li>
              <li>個人または所属バンドから予約名義を選びます。</li>
              <li>利用したい時間枠と必須の希望利用時間を選び、必要に応じて許容時間の起点・終点を入力します。部屋を選ぶ必要はありません。</li>
            </ol>

            <div className="overflow-x-auto rounded-md border">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr>
                    <th className={thClass}>許容時間（起点・終点）</th>
                    <th className={thClass}>割り当て方</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className={tdClass}>指定する</td>
                    <td className={tdClass}>希望時間帯の中から、指定した長さの連続枠を探します。</td>
                  </tr>
                  <tr>
                    <td className={tdClass}>指定しない</td>
                    <td className={tdClass}>スタジオの時間枠全体から、指定した長さの連続枠を探します。</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <ul className="list-disc space-y-1 pl-5">
              <li>希望利用時間は必須で、30〜120分、10分単位です。</li>
              <li>許容時間（起点）と許容時間（終点）は、両方を指定するか、両方とも指定しないでください。</li>
              <li>同じ個人・バンド名義で、希望可能時間帯が重なる申込はできません。</li>
              <li>自分に関係する抽選前の申込は、カード右下の赤い「取消」ボタンから取り消せます。</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ScaleIcon className="h-5 w-5" />
              抽選の順番
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-relaxed text-foreground">
            <p>申込は次の優先順で処理されます。</p>
            <ol className="list-decimal space-y-2 pl-5 font-medium text-foreground">
              <li>本バンド</li>
              <li>自由バンド</li>
              <li>個人</li>
            </ol>
            <p>
              同じ区分では、抽選対象日の直前30日間に外部スタジオを利用した時間が少ない名義から処理します。個人は本人の利用分数、バンドは抽選時点の全メンバーの平均利用分数を公平性スコアとして使います。スコアも同じ場合は、申込時に決まるランダムな順番で処理します。
            </p>
            <p>
              バンド区分と所属メンバーは抽選時点の状態で判定します。無効なバンドやメンバーがいないバンドは落選になります。
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DoorOpenIcon className="h-5 w-5" />
              部屋と時間の自動割り当て
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-relaxed text-foreground">
            <ol className="list-decimal space-y-2 pl-5">
              <li>時間枠に含まれるすべての部屋について、確定済み予約を除いた連続空き時間を調べます。</li>
              <li>希望時間を確保できる中から、最長の連続空き時間がある部屋を選びます。同じ長さなら部屋番号が小さい方を選びます。</li>
              <li>5分単位で配置候補を比較し、残りの申込と競合しにくい時間を選びます。同じ条件なら早い時刻を選びます。</li>
              <li>希望時間をすべて確保できない場合は、すべての部屋で最も長い連続空き枠へ短縮します。30分未満しか確保できない場合は落選です。</li>
            </ol>
            <p>
              同じメンバーが参加する確定済みのホール予約・外部予約や、同じ抽選ですでに当選した予約と時間が重ならない候補だけを使います。実際の割当時間が予約上限を超える候補も使用しません。
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>予約上限と利用実績</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-relaxed text-foreground">
            <div>
              申し込み中は、希望分数を予約上限から一時的に確保します。<Badge variant="secondary" className="mx-1">当選</Badge>した場合は確定予約として引き継ぎ、<Badge variant="outline" className="mx-1">落選</Badge>または抽選前に取り消した場合は解放します。
            </div>
            <p>
              当選した利用時間は公平性のための利用実績に記録されます。バンド予約は抽選時点の全メンバーへ記録され、確定後にキャンセルまたは短縮しても、一度確保した分数は取り消されません。
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>申込状況と結果の確認</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-relaxed text-foreground">
            <p>「外部抽選」では、抽選対象の時間枠が横方向に並び、その下に各時間枠への申込がすべて表示されます。</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>自分または所属バンドに関係する申込は、濃い枠線で表示されます。</li>
              <li>抽選前は、確定済み予約を除いた部屋ごとの空きへ、優先区分を保ちながら同順位の処理順を複数回入れ替えて割り当てた、おおよその当選確率が表示されます。</li>
              <li>当選確率は目安です。公平性スコア、予約上限、メンバーの予約重複、同点抽選順位などにより、実際の結果とは異なる場合があります。</li>
              <li>抽選後は、公平性スコア、同点抽選順位、割り当てられた部屋と利用時間を確認できます。</li>
            </ul>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">当選確率 約○%</Badge>
              <Badge>当選</Badge>
              <Badge variant="destructive">落選</Badge>
            </div>
          </CardContent>
        </Card>

        <Alert>
          <AlertCircleIcon className="h-4 w-4" />
          <AlertTitle>希望どおりの時間になるとは限りません</AlertTitle>
          <AlertDescription>
            空き状況によって部屋、開始時刻、終了時刻が自動で決まります。当選後は必ず実際の割当内容を確認してください。
          </AlertDescription>
        </Alert>
      </main>
    </>
  );
}
