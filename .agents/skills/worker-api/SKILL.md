---
name: worker-api
description: MLM-DX の Cloudflare Worker バックエンドを実装・修正する。Hono ルート、認証・権限、共有 Zod スキーマ、D1 SQL と migration、予約処理、cron、Durable Object、WebSocket、Web 側 API 契約を変更するときに使う。
---

# MLM-DX Worker API 開発

## ワークフロー

1. 対象ルート、関連 utility、`lib/shared-schemas.ts`、D1 テーブルを追い、業務制約を整理する。
2. request、response、エラーコード、認証、管理者権限、日時基準を先に決める。
3. 共有契約を変更する場合は共有 Zod スキーマを一次情報として更新する。
4. `apps/worker/src/features/<feature>` の責務境界に従い、domain、application、infrastructure を実装し、`src/routes` の HTTP adapter から呼び出す。
5. D1 処理を repository に実装し、必要なら新しい連番 migration を追加する。
6. ルートを新設した場合は `apps/worker/src/index.ts` への mount を確認する。
7. Web から利用する場合は `apps/web/lib/api.ts` または `server-api.ts` まで更新する。
8. 純粋計算と fake repository を使うユースケーステストを追加する。
9. `$verify` に従い、Worker test と影響するアプリの type-check を実行する。

## 責務の分離

- `domain` に純粋な業務計算と値の判定を置く。Hono、`Bindings`、D1、現在時刻、乱数、副作用を参照しない。
- `application` にユースケースと port を置く。repository、clock、ID、乱数、通知、リアルタイム配信は interface 経由で受け取る。
- `infrastructure` に D1 repository、外部サービス、row 正規化を置く。SQL の条件付き更新や batch を application へ漏らさない。
- `http` は Zod 検証、認証ユーザーの取得、application error と HTTP response の対応に限定する。
- repository は汎用 CRUD ではなくユースケースに必要な操作を表現し、競合時は更新件数などの明示的な結果を返す。
- route 同士を import しない。共有する所属確認や予約制限は application port と repository を再利用する。
- 移行済み route・processor へ `prepare()` や `batch()` を戻さず、`pnpm --filter mlm-dx-worker check:boundaries` で確認する。

## API 境界

- protected router 全体には `requireAuth` を適用し、管理操作では `requireAdmin(c.get('user').role)` を実行する。
- body、params、query は境界で検証する。ZodError は既存形式に合わせて 400 を返す。
- レスポンスは原則 `{ success, data?, error?, message? }` に揃え、機械可読エラーは大文字スネークケースにする。
- 401、403、404、409、400、500 を意味に応じて使い分ける。内部例外や秘密情報をレスポンスへ含めない。
- API の型を Worker 内だけに複製せず、Web と共有する契約は `lib/shared-schemas.ts` に置く。

## D1 と業務制約

- SQL は `prepare()` と `.bind()` を使い、ユーザー入力を文字列連結しない。
- 複数書き込みが一体の操作なら、途中失敗時の不整合を検討する。D1 の利用可能な atomic/batch パターンを既存コードと実行環境に合わせる。
- SQLite の 0/1、JSON 文字列、nullable、数値を Zod parse 前に正規化する。
- 日時は ISO 文字列と JST の業務日を区別する。予約では同日、6:00–23:00、10–240分など、共有 validator と既存 processor の制約を再利用する。
- event の期限、group/song limit、reservation state、重複・競合判定を UI だけに任せない。
- DB 構造を変える場合は既存の最大番号に続く migration を追加し、既存データの backfill と default/nullability を明示する。
- migration の適用や DB reset は、ユーザーが明示的に依頼した環境だけで行う。

## Durable Objects と非同期処理

- Durable Object の state schema/version、同時更新、再接続、切断済み socket の除去を確認する。
- WebSocket の URL と message schema を Web と Worker で同期する。
- cron/processor は再実行しても破壊的な重複処理にならないようにし、JST と UTC の発火時刻を確認する。
- 外部 API や認証では timeout、署名・nonce・state、cookie 属性、ログへの秘密情報混入を確認する。

## 完了条件

- 認証、権限、検証、業務制約がサーバー側で強制される。
- D1 row と API response の変換が共有スキーマを通る。
- Web 側利用箇所と API 契約が一致する。
- 正常系に加え、未認証、権限不足、不正入力、競合、対象なしを確認する。
- 日時や抽選は固定 clock・固定乱数、DB を伴うユースケースは fake repository で正常系と競合系を確認する。
- Worker と必要な関連アプリの type-check 結果を報告する。
