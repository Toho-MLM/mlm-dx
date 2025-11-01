import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const sectionClass = 'space-y-4';
const tableClass = 'w-full border border-gray-200 rounded-lg overflow-hidden text-sm';
const thClass = 'bg-gray-50 font-semibold text-gray-700 px-3 py-2 border-b border-gray-200 text-left align-top';
const tdClass = 'px-3 py-2 border-b border-gray-100 align-top';

 

 

export default function AdminManualPage() {
  return (
    <>
      <PageHeader />
      <div className="max-w-4xl mx-auto p-4 pt-0 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>はじめに</CardTitle>
          </CardHeader>
          <CardContent className={sectionClass}>
            <ul className="list-disc pl-6 space-y-2 text-sm text-gray-700">
              <li>
                <strong>対象:</strong> 管理者権限のあるユーザー向けの案内です。
              </li>
              <li>
                <strong>ログイン:</strong> 事前登録済みの Google アカウントでログインします。
              </li>
              <li>
                <strong>プロフィール:</strong> 初回はニックネームを登録してください。未登録の場合はプロフィール画面が開きます。
              </li>
              <li>
                <strong>権限の注意:</strong> 自分の権限を下げると管理機能が使えなくなります。変更は慎重に行ってください。
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>画面の見方</CardTitle>
          </CardHeader>
          <CardContent className={sectionClass}>
            <div className="space-y-2 text-sm text-gray-700">
              <h3 className="text-base font-semibold text-gray-900">サイドバー</h3>
              <ul className="list-disc pl-6 space-y-1">
                <li>ホール予約: 予約の確認・管理</li>
                <li>イベント: イベント、セットリスト、タイムラインの管理</li>
                <li>バンド: バンドの作成・編集</li>
                <li>資料: アーカイブ、部員名簿</li>
              </ul>
              <p>ページ名はサイドバーとページヘッダーに表示されます。迷ったらサイドバーのラベルを参照してください。</p>
            </div>
            <div className="space-y-2 text-sm text-gray-700">
              <h3 className="text-base font-semibold text-gray-900">管理者モードのスイッチ</h3>
              <p>予約やバンドの画面にあるスイッチをオンにすると、管理者向けの操作（全体の閲覧・編集など）が有効になります。</p>
            </div>
            <div className="space-y-2 text-sm text-gray-700">
              <h3 className="text-base font-semibold text-gray-900">通知</h3>
              <p>操作結果は画面右上に表示されます。赤い通知は失敗です。内容を読み、必要に応じて操作をやり直してください。</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>日々のチェック</CardTitle>
          </CardHeader>
          <CardContent>
            <table className={tableClass}>
              <thead>
                <tr>
                  <th className={thClass}>タイミング</th>
                  <th className={thClass}>項目</th>
                  <th className={thClass}>内容</th>
                </tr>
              </thead>
              <tbody>
                <tr className="odd:bg-white even:bg-gray-50">
                  <td className={tdClass}>朝</td>
                  <td className={tdClass}>当日の予約を確認</td>
                  <td className={tdClass}>予約表で本日の予約状況を確認し、重複や時間の抜け漏れがないかをチェックします。</td>
                </tr>
                <tr className="odd:bg-white even:bg-gray-50">
                  <td className={tdClass}>日中</td>
                  <td className={tdClass}>追加・変更の把握</td>
                  <td className={tdClass}>新しい予約や変更がないかを確認します。必要に応じて利用者へ案内します。</td>
                </tr>
                <tr className="odd:bg-white even:bg-gray-50">
                  <td className={tdClass}>随時</td>
                  <td className={tdClass}>メンバー・バンドの更新</td>
                  <td className={tdClass}>異動や役職変更があれば部員名簿とバンドを更新します。</td>
                </tr>
                <tr className="odd:bg-white even:bg-gray-50">
                  <td className={tdClass}>イベント前</td>
                  <td className={tdClass}>締切と準備の最終確認</td>
                  <td className={tdClass}>エントリーやセットリストの締切後は受付をオフにし、タイムラインとセットリストを最終確認します。</td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>予約の管理</CardTitle>
          </CardHeader>
          <CardContent className={sectionClass}>
            <div>
              <h3 className="text-base font-semibold text-gray-900 mb-2">カレンダーとステータス</h3>
              <p className="text-sm text-gray-700 mb-3">管理者モードをオンにすると、すべての予約が表示されます。</p>
              <table className={tableClass}>
                <thead>
                  <tr>
                    <th className={thClass}>ステータス</th>
                    <th className={thClass}>意味</th>
                    <th className={thClass}>管理者対応</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="odd:bg-white even:bg-gray-50">
                    <td className={tdClass}>
                      <Badge variant="secondary">PENDING</Badge>
                    </td>
                    <td className={tdClass}>受付中の予約</td>
                    <td className={tdClass}>内容に問題がないか確認</td>
                  </tr>
                  <tr className="odd:bg-white even:bg-gray-50">
                    <td className={tdClass}>
                      <Badge variant="secondary">CONFIRMED</Badge>
                    </td>
                    <td className={tdClass}>確定した予約</td>
                    <td className={tdClass}>当日の運用に反映</td>
                  </tr>
                  <tr className="odd:bg-white even:bg-gray-50">
                    <td className={tdClass}>
                      <Badge variant="secondary">DECLINED</Badge>
                    </td>
                    <td className={tdClass}>確保できなかった予約</td>
                    <td className={tdClass}>必要に応じて案内</td>
                  </tr>
                  <tr className="odd:bg-white even:bg-gray-50">
                    <td className={tdClass}>
                      <Badge variant="secondary">CANCELLED</Badge>
                    </td>
                    <td className={tdClass}>キャンセル済み</td>
                    <td className={tdClass}>対応不要</td>
                  </tr>
                  <tr className="odd:bg-white even:bg-gray-50">
                    <td className={tdClass}>
                      <Badge variant="secondary">WITHDRAWN</Badge>
                    </td>
                    <td className={tdClass}>ユーザーが取り下げ</td>
                    <td className={tdClass}>対応不要</td>
                  </tr>
                  <tr className="odd:bg-white even:bg-gray-50">
                    <td className={tdClass}>
                      <Badge variant="secondary">COMPLETED</Badge>
                    </td>
                    <td className={tdClass}>利用完了</td>
                    <td className={tdClass}>記録の参照に使用</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="text-sm text-gray-700 space-y-2">
              <h3 className="text-base font-semibold text-gray-900">キャンセルと同日予約</h3>
              <p>予約詳細で状況を確認し、必要に応じて利用者へキャンセルや変更の案内を行ってください。</p>
              <p>同日の予約はすぐに反映されます。朝の確認を習慣にしてください。</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>部員名簿の管理</CardTitle>
          </CardHeader>
          <CardContent className={sectionClass}>
            <div className="space-y-2 text-sm text-gray-700">
              <h3 className="text-base font-semibold text-gray-900">一覧の閲覧と検索</h3>
              <p>氏名・ニックネーム・学生番号で検索できます。表示順は学年の高い順です。</p>
            </div>
            <div className="space-y-2 text-sm text-gray-700">
              <h3 className="text-base font-semibold text-gray-900">メンバーの新規登録</h3>
              <ol className="list-decimal pl-6 space-y-1">
                <li>「追加」から、名前・メールアドレス・学年を入力します。</li>
                <li>登録後、メールアドレスが Google アカウントと一致していればログインできます。</li>
                <li>権限は必要に応じて編集で変更します。</li>
              </ol>
            </div>
            <div className="space-y-2 text-sm text-gray-700">
              <h3 className="text-base font-semibold text-gray-900">既存メンバーの編集</h3>
              <ol className="list-decimal pl-6 space-y-1">
                <li>対象行の「編集」から、ニックネーム・学年・担当楽器・権限を更新します。</li>
                <li>担当楽器は最低 1 つ以上選択してください。</li>
                <li>自分の権限変更は慎重に行ってください。</li>
              </ol>
            </div>
            <div className="space-y-2 text-sm text-gray-700">
              <h3 className="text-base font-semibold text-gray-900">メンバー削除</h3>
              <p>行末の削除ボタンから実行できます。削除後の復旧はできません。</p>
            </div>
            <div className="space-y-3 text-sm text-gray-700">
              <h3 className="text-base font-semibold text-gray-900">CSV 取り込み</h3>
              <ol className="list-decimal pl-6 space-y-1">
                <li>「CSV インポート」から、ヘッダー付きのファイルを選択します。</li>
                <li>名前・メールアドレス・学年の入力を含めてください。</li>
                <li>取り込み後に内容を確認し、必要に応じて修正します。</li>
              </ol>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>バンドの管理</CardTitle>
          </CardHeader>
          <CardContent className={sectionClass}>
            <div className="space-y-2 text-sm text-gray-700">
              <h3 className="text-base font-semibold text-gray-900">管理者モード</h3>
              <p>スイッチをオンにすると、すべてのバンドの編集と作成が可能です。</p>
            </div>
            <div className="space-y-2 text-sm text-gray-700">
              <h3 className="text-base font-semibold text-gray-900">バンドの作成・編集</h3>
              <ol className="list-decimal pl-6 space-y-1">
                <li>「作成」からバンド名とメンバーを設定します（最低 2 名）。</li>
                <li>各メンバーに担当楽器を割り当てます。</li>
                <li>必要に応じて区分や有効/無効を切り替えます。</li>
              </ol>
            </div>
            <div className="space-y-2 text-sm text-gray-700">
              <h3 className="text-base font-semibold text-gray-900">バンドの有効 / 無効切り替え</h3>
              <p>カード右上のメニューから切り替えできます。無効化したバンドは薄く表示されます。</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>イベントの管理</CardTitle>
          </CardHeader>
          <CardContent className={sectionClass}>
            <div className="space-y-2 text-sm text-gray-700">
              <h3 className="text-base font-semibold text-gray-900">イベントカードの見方</h3>
              <p>イベント日や各締切が表示されます。必要な項目が足りているかをカードで確認できます。</p>
            </div>
            <div className="space-y-2 text-sm text-gray-700">
              <h3 className="text-base font-semibold text-gray-900">イベントの作成・編集</h3>
              <ol className="list-decimal pl-6 space-y-1">
                <li>ページヘッダーの「作成」ボタンでフォームを開きます。</li>
                <li>必要項目を入力し、保存します。</li>
                <li>編集・削除はカード右上のメニューから実行します（削除は取り消し不可）。</li>
              </ol>
            </div>
            <div className="space-y-2 text-sm text-gray-700">
              <h3 className="text-base font-semibold text-gray-900">エントリー管理</h3>
              <ul className="list-disc pl-6 space-y-1">
                <li>「参加登録」ボタンでエントリーダイアログを開き、自由バンドを追加します。</li>
                <li>上限超過時はエラーメッセージに超過メンバー名が表示されます。</li>
                <li>登録済みエントリーはイベント詳細内の一覧で確認でき、不要なエントリーは削除できます。</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>セットリストの管理</CardTitle>
          </CardHeader>
          <CardContent className={sectionClass}>
            <ol className="list-decimal pl-6 space-y-2 text-sm text-gray-700">
              <li>右上のセレクトでイベントを選択して絞り込みます。</li>
              <li>各バンドの「編集」から曲名・アーティストを入力して保存します。</li>
              <li>入場 SE を使う場合はスイッチをオンにして入力します。</li>
              <li>締切後は編集できません。必要時はイベント設定から受付を再開してください。</li>
            </ol>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>タイムラインの管理</CardTitle>
          </CardHeader>
          <CardContent className={sectionClass}>
            <ol className="list-decimal pl-6 space-y-2 text-sm text-gray-700">
              <li>右上のセレクトからイベントを選び、「編集」を押します。</li>
              <li>開始・終了時刻を入力し、必要に応じて並び替えます。</li>
              <li>未設定リストから追加すると、一覧に組み込まれます。</li>
            </ol>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>アーカイブの管理</CardTitle>
          </CardHeader>
          <CardContent className={sectionClass}>
            <ol className="list-decimal pl-6 space-y-2 text-sm text-gray-700">
              <li>ページヘッダーの「追加」から、タイトル・YouTube URL・年を入力します。</li>
              <li>追加後は年度ごとに表示されます。</li>
              <li>削除は元に戻せません。内容を確認してから操作してください。</li>
            </ol>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>困ったときは</CardTitle>
          </CardHeader>
          <CardContent className={sectionClass}>
            <ul className="list-disc pl-6 space-y-1 text-sm text-gray-700">
              <li>保存できない場合は、未入力や締切超過がないか確認してください。</li>
              <li>表示がおかしい場合は、ページの再読み込みや別のブラウザでの確認を試してください。</li>
              <li>権限で操作できないときは、管理担当に権限の見直しを依頼してください。</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

