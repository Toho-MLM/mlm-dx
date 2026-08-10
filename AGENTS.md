# MLM-DX 開発ルール

## コミュニケーション

- ユーザーへの説明、進捗、最終回答は日本語で行う。
- 不明点はまず既存コード、README、`package.json`、Git 履歴から確認する。
- 変更後は、変更内容・検証結果・残課題を簡潔に報告する。

## プロジェクト構成

- pnpm workspace のモノレポとして扱う。
- `apps/web`: Next.js 14 App Router、React、TypeScript、Tailwind CSS、shadcn/ui。
- `apps/worker`: Cloudflare Workers、Hono、D1、Durable Objects。
- `lib/shared-schemas.ts`: Web と Worker が共有する Zod スキーマと型の一次情報。
- `apps/worker/migrations`: D1 の差分マイグレーション。
- パスエイリアスは Web の `@/*` と両アプリの `@shared-schemas` を優先する。

## 実装方針

- 変更前に同種の画面、ルート、API メソッドを探し、既存パターンに合わせる。
- API 契約を変更するときは、共有スキーマ、Worker、Web API クライアント、画面を一続きで確認する。
- 入力値は境界で Zod により検証し、D1 の SQL はプレースホルダーと `.bind()` を使う。
- 認証が必要な Worker ルートには `requireAuth` を適用し、管理操作には `requireAdmin` を適用する。
- D1 の boolean、JSON、数値をレスポンスへ返す前に、共有スキーマが期待する形へ正規化する。
- D1 の boolean は Worker 側で `true` / `false` へ変換し、共有スキーマと Web では boolean のみを扱う。`0` / `1` を API レスポンスへ露出しない。
- `created_at` と `updated_at` はDB内部の監査・並び替え用として扱い、APIレスポンスや共有レスポンス型へ含めない。
- 日時の業務判定は JST を基準とする。ISO 文字列のタイムゾーンと日付境界を明示的に扱う。
- UI は既存の `apps/web/components/ui` と共通コンポーネントを再利用し、モバイル表示も確認する。
- 画面タイトルやセクション見出しから内容が明らかな場合、同じ意味の説明文や案内文を重ねない。ユーザーの判断や操作に必要な文言だけを表示する。
- ユーザー向け文言は日本語を基本とし、API の機械可読エラーコードは既存の大文字スネークケースに合わせる。

## Worker の責務境界

- 新規または移行済み機能は `apps/worker/src/features/<feature>` に置き、`domain`、`application`、`infrastructure` の責務を分ける。HTTP adapter は現行 mount と互換性を保つため `apps/worker/src/routes` に置く。
- `domain` は純粋な業務計算だけを持ち、Hono、Cloudflare bindings、D1、現在時刻、乱数、通知へ直接依存しない。
- `application` はユースケースと repository / clock / notification などの port を定義し、SQL や HTTP ステータスを扱わない。
- D1 SQL、batch、row の boolean・JSON・数値変換は `infrastructure` の repository 実装に限定する。
- HTTP ルートは入力検証、認証情報の受け渡し、application の結果から既存 API レスポンスへの変換を担当する。route 同士を import しない。
- `prepare()` と `batch()` は `features/*/infrastructure` 以外へ置かない。例外を追加せず、必要な操作を repository port として定義する。
- 時刻、ID、乱数、メール、WebSocket は注入可能な依存にし、計算ロジックとユースケースを fake repository でテストする。

## データベースと運用

- スキーマ変更は既存データを保持する新しい連番 migration として追加する。
- `schema.sql` と migrations の役割を確認し、新規環境と既存環境で構造が食い違わないようにする。
- `.env`、`.dev.vars`、トークン、OAuth 情報、実データベースを表示・コミットしない。
- ユーザーの明示依頼なしに deploy、本番 migration、DB reset、seed、秘密情報の更新を実行しない。
- Durable Object や WebSocket を変更するときは、永続化、接続切断、複数クライアント、バージョン競合を考慮する。

## 変更と検証

- 作業開始時に `git status --short` を確認し、ユーザーの未コミット変更を保持する。
- 関係のないリファクタリング、整形、生成物の更新を混ぜない。
- 生成物 (`.next`、`.open-next`、`.wrangler`、`.worker-bundle`) を編集・コミットしない。
- 最低限、変更したアプリの type-check を行う。可能なら lint、境界をまたぐ変更では両アプリの type-check、リリース影響が大きい変更では build まで行う。
- ルートコマンドを優先する: `pnpm type-check`、`pnpm lint`、`pnpm build`。範囲を限定する場合は定義済みのアプリ別スクリプトを使う。
- Worker の domain、application、repository 境界を変更した場合は `pnpm test:worker` を実行する。
- 自動テストがない領域では、代表的な正常系・権限エラー・入力エラー・境界日時を手動確認項目として報告する。

## プロジェクト skills

- Web の画面・操作・API クライアント変更には `$web-feature` (`/web-feature`) を使う。
- Worker API、共有スキーマ、D1、Durable Object の変更には `$worker-api` (`/worker-api`) を使う。
- 実装後の検証や既存変更の確認には `$verify` (`/verify`) を使う。
- コミットの分割、メッセージ作成、ステージング、コミット実行には `$commit` (`/commit`) を使う。
