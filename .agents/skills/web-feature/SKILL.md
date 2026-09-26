---
name: web-feature
description: MLM-DX の Next.js フロントエンド機能を既存設計に沿って実装・修正する。`apps/web` のページ、React コンポーネント、フォーム、API クライアント、共有型、認証導線、レスポンシブ UI を変更するときに使う。
---

# MLM-DX Web 機能開発

## ワークフロー

1. `git status --short` で既存変更を把握し、対象画面と類似画面を読む。
2. UI・操作・通知に影響する場合は、[デザインルール](../../../docs/design-rules.md) を読み、使う共通部品、主要操作、通知と失敗時の復帰方法を決める。
3. データ契約を `lib/shared-schemas.ts`、`apps/web/lib/api.ts`、`apps/web/lib/server-api.ts` で確認する。
4. Server Component と Client Component の境界を決め、クライアント機能に必要な最小範囲だけ `"use client"` にする。
5. 共通部品を再利用し、変更対象を承認済みのデザインルールに合わせて実装する。既存画面の不一致を新しい実装へ引き継がない。
6. `$verify` の「Web のデザイン確認」に従って正常系・失敗系・モバイル表示を確認し、少なくとも Web の type-check を実行する。

## データ取得と API

- 既存の `api` インスタンスと `httpClient` を使い、画面から URL や fetch 設定を重複定義しない。
- ブラウザ操作は `apps/web/lib/api.ts`、Server Component からの取得は `apps/web/lib/server-api.ts` の既存パターンに合わせる。
- 新しい API 契約が必要なら、先に `lib/shared-schemas.ts` の型と Zod スキーマを更新する。Worker 側の変更には `$worker-api` も使う。
- 更新後に一覧を再取得するかローカル状態を更新するかを明示し、二重送信を防ぐ。
- API エラーコードを握り潰さず、既存の `apps/web/lib/error-label.ts` または画面固有の対応表で日本語表示に変換する。

## UI 実装

- `apps/web/components/ui` の shadcn/ui、Lucide icons、既存の header/dialog/list コンポーネントを優先する。
- Tailwind の既存トークンとレイアウトに合わせ、独自の色・間隔・ブレークポイントを安易に増やさない。
- 通知、入力・非同期処理、ダイアログ、見た目はデザインルールの該当節を適用する。
- 管理者モードは表示制御だけに頼らず、Worker 側の権限検証を前提とする。
- 日時は保存形式と JST 表示を分離し、締切や日付境界を `new Date()` のローカル環境任せにしない。
- `key`、並び順、選択状態を安定した ID で管理する。

## 完了条件

- 要求された操作が正常系と失敗系で理解できる表示になる。
- API の request/response 型と画面の想定が一致する。
- 既存画面の navigation、認証、管理者モードを壊さない。
- Web の type-check 結果と、実行できなかった検証を報告する。
- 適用したデザイン基準、画面・通知の確認結果、未実施項目、変更範囲外に残る既存の差分を簡潔に報告する。
