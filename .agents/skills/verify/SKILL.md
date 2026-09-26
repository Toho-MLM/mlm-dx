---
name: verify
description: MLM-DX のコード変更を安全に検証する。実装後、バグ修正後、レビュー時、コミット前に、Git 差分から影響範囲を特定し、Web/Worker の type-check、lint、build、手動確認項目を選ぶときに使う。
---

# MLM-DX 変更検証

## 変更範囲を確定する

1. `git status --short` と `git diff --stat` を確認する。
2. `git diff -- <対象>` で自分の変更と既存の未コミット変更を区別する。
3. 変更ファイルから検証範囲を決める。

- `apps/web/**`: Web の type-check。UI/route/build 設定なら lint と build も検討する。
- `apps/worker/**`: Worker の type-check。route、binding、Durable Object、wrangler 設定なら build も検討する。
- `apps/worker/src/features/**`: `pnpm test:worker` で境界検査、純粋 domain、fake repository を使う application テストを実行する。
- `lib/shared-schemas.ts`: Web と Worker の両方を検証する。
- `package.json`、lockfile、tsconfig、workspace 設定: 原則としてルート type-check、lint、build を検討する。
- migration/schema: SQL の構文、既存 schema との整合、適用順、backfill、破壊性を確認する。
- デザイン文書・スキルのみ: 参照先、承認状態、工程間の整合を確認する。アプリの実装に変更がなければ type-check/build は不要。

## 段階的に実行する

最小の関連チェックから始め、失敗を解消してから広いチェックへ進む。

```bash
pnpm test:worker
pnpm type-check
pnpm lint
pnpm build
```

範囲を限定するときは、ルートで定義済みの次のスクリプトを使う。

```bash
pnpm lint:web
pnpm lint:worker
pnpm build:web
pnpm build:worker
pnpm --filter mlm-dx-worker run check:boundaries
pnpm --filter mlm-dx-worker run test
pnpm --filter mlm-dx-web run type-check
pnpm --filter mlm-dx-worker run type-check
```

## 失敗を扱う

- 最初の関連エラーを完全に読み、変更由来か既存問題かを差分と該当行から判断する。
- 変更由来なら修正して同じチェックを再実行する。
- 既存問題や環境要因なら、勝手に無関係な修正を広げず、コマンドと代表エラーを報告する。
- build がネットワーク、秘密情報、Cloudflare binding を必要とする場合は、type-check/lint で可能な範囲を完了し、不足条件を明示する。
- lint の自動修正や formatter をリポジトリ全体へかける前に、無関係な差分が出ないか確認する。

## 手動確認を設計する

- UI: desktop/mobile、loading、空状態、入力エラー、API エラー、管理者/一般ユーザー。
- API: 正常系、401、403、400、404/409、DB row の型変換。
- 日時: JST の日付境界、締切直前/直後、予約の最短/最長と営業時間。
- realtime: 2クライアント、再接続、競合更新、切断後の状態。
- migration: 空DB、既存データあり、再適用時の挙動。

## 結果を報告する

- 成功したコマンドを列挙する。
- 失敗したコマンドは代表エラーと原因を示す。
- 未実施項目と、その理由またはユーザーが行う確認手順を示す。
- 変更と無関係な既存問題を分けて示す。

## Web のデザイン確認

- UI・操作・通知に影響する変更では、[デザインルール](../../../docs/design-rules.md) の「検証・完了」から関連する条件を選ぶ。API変更が画面に影響する場合は利用側も確認する。
- 差分と実際の表示・操作で判定する。業務データのラベルや件数を通知と誤認せず、文字列検索の一致だけで inline メッセージ違反と判定しない。
- 共通部品の変更は代表的な利用画面も確認する。確認済み・未実施と理由・範囲外の既存差分を区別して報告する。
- 変更で生じた違反は修正する。承認済み基準の適用を再承認の質問に戻さず、許容される例外だけをデザインルールの条件に沿って記録する。
