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
      <PageHeader showSidebarTrigger={false} />
      <main className="mx-auto w-full max-w-4xl space-y-4 p-4 pt-0">
        <Alert>
          <Clock3Icon className="h-4 w-4" />
          <AlertTitle>ホールは締切翌日0:00、外部は利用前日21:00に抽選します</AlertTitle>
          <AlertDescription>
            時刻はすべて日本時間（JST）です。抽選後の空き時間は「予約表」または「外部予約」から予約できます。通常予約は14日先までの制限と予約時間上限が適用されます。
          </AlertDescription>
        </Alert>

        <Card>
          <CardHeader><CardTitle>ホール：期間単位・第3希望方式</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm leading-relaxed">
            <ol className="list-decimal space-y-2 pl-5">
              <li>「抽選」のホール募集で対象期間と共通利用時間を確認し、所属バンドを選びます。募集ごとに本バンドまたは自由バンドのどちらかが対象となり、所属メンバーが代表して申し込めます。管理者は対象区分に一致する非所属の有効なバンドの代理申込・締切前の取消もできます。</li>
              <li>第1希望の開始日時を入力します。第2・第3希望は任意で、終了日時は募集の共通利用時間から自動計算されます。</li>
              <li>期間全体につき1バンド1申込・最大1枠の当選です。締切前なら取消後に再申込できます。</li>
            </ol>
            <p>各日6:00〜23:00、日またぎ不可。同一日時の重複はできませんが、希望同士が部分的に重なっていても申し込めます。募集の利用時間は10〜240分で、14日先までの申込制限はありません。</p>
            <p>締切日の翌日0:00に受付を終了して抽選します。例：9月25日締切なら9月26日0:00です。</p>
            <p>全バンドの第1希望を均等なランダム順で判定し、未当選バンドだけ第2希望、続いて第3希望を判定します。対象区分内で利用実績による優先はありません。申込後にバンドの区分が変わった場合、抽選時に対象外なら落選となります。</p>
            <p>既存の有効なホール予約、予約不可期間、所属メンバーの既存予約と競合する希望は除外します。時間の短縮・移動や希望外の割当は行いません。結果には当落・当選希望順位・割当日時を表示します。</p>
            <p>募集作成から抽選完了まで、対象期間の通常予約は制限されます（既存の管理者例外を除く）。処理失敗中も保護を継続し、中止または完了後に空きを開放します。既存予約は取り消しません。</p>
            <p>申込と当選予約は通常の予約時間上限に含みません。当選予約は取消可能ですが、一般ユーザーによる日時変更はできません。別日時を利用する場合は通常予約として取り直してください。取消による再抽選はありません。</p>
            <p>管理者は募集作成時に対象を「本バンド」「自由バンド」から選択します。抽選開始前に募集を中止できます。中止すると申込も取消になり、通常予約への制限を解除します。</p>
          </CardContent>
        </Card>
        <h2 className="pt-4 text-lg font-semibold">外部抽選・移行前のホール抽選</h2>
        <p className="text-sm text-muted-foreground">以下は従来方式の説明です。移行前に作成されたホール抽選は従来方式のまま完了します。</p>
        <Card>
          <CardHeader>
            <CardTitle>申し込み方法</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-relaxed text-foreground">
            <ol className="list-decimal space-y-2 pl-5">
              <li>「抽選」で「申込」を押します。</li>
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
                    <td className={tdClass}>選択した抽選対象の時間枠全体から、指定した長さの連続枠を探します。</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <ul className="list-disc space-y-1 pl-5">
              <li>希望利用時間は必須で、10〜240分の範囲で分単位に入力できます。</li>
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
              同じ区分では、時間の余裕と公平性スコアを同じ比重で評価したウェイトにより、処理順を抽選します。基本ウェイト1に、許容時間から希望利用時間を引いた余裕が少ないほど最大2、直前30日間の利用時間が少ないほど最大2を加えます。
            </p>
            <p>
              ウェイトは1〜5で、大きいほど先に処理されやすくなりますが、順番は確定ではありません。個人は個人ID、バンドはグループIDごとの利用分数を公平性スコアとして使い、所属メンバー個人の利用実績は合算しません。
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
              <li>同じ時間帯を希望する残りの申込数と空き時間から公平な配分上限を計算します。たとえば、1部屋の2時間枠を2件が希望する場合は、1時間ずつを上限にします。</li>
              <li>希望時間を確保できる中から、最長の連続空き時間がある部屋を選びます。同じ長さなら部屋番号が小さい方を選びます。</li>
              <li>1分単位で配置候補を比較し、残りの申込と競合しにくい時間を選びます。同じ条件なら早い時刻を選びます。</li>
              <li>希望時間をすべて確保できない場合は、すべての部屋で最も長い連続空き枠へ短縮します。10分未満しか確保できない場合は落選です。</li>
            </ol>
            <p>
              同じメンバーが参加する受付済みのホール予約・確定済みの外部予約や、同じ抽選ですでに当選した予約と時間が重ならない候補だけを使います。ホールでは予約不可期間も空き時間から除外します。実際の割当時間が予約上限を超える候補も使用しません。
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
              公平性は対象別に計算します。ホール抽選ではホール利用時間、外部抽選では外部利用時間を、個人は個人ID、バンドはグループIDごとに集計します。キャンセル済みの予約も集計に含み、予約時間を変更した場合は変更後の分数を使います。
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>申込状況と結果の確認</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-relaxed text-foreground">
            <p>「抽選」では、ホールと外部の抽選対象が横方向に並び、その下に各時間枠への申込がすべて表示されます。</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>自分または所属バンドに関係する申込は、濃い枠線で表示されます。</li>
              <li>抽選前は、既存予約と予約不可期間を除いた空きを競合申込へ公平配分し、優先区分ごとに時間の余裕と公平性から計算したウェイトで処理順を複数回抽選した、おおよその当選確率が表示されます。希望時間より短い割当でも、10分以上なら当選として数えます。</li>
              <li>当選確率は目安です。予約上限、メンバーの予約重複、表示後の利用実績の変化などにより、実際の結果とは異なる場合があります。</li>
              <li>抽選後は、公平性スコア、割り当てられた部屋と利用時間を確認できます。</li>
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
