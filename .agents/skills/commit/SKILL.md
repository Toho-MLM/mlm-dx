---
name: commit
description: MLM-DX の作業ツリーを調査し、変更をレビュー・取り消ししやすい単位へ分割して、リポジトリの履歴に合うコミットメッセージを提案またはコミットする。コミット計画、部分ステージング、コミットメッセージ作成、コミット実行を依頼されたときに使う。
---

# MLM-DX コミット整理

## 1. 変更全体を把握する

次を確認してからステージングする。

```bash
git status --short
git diff --stat
git diff
git diff --cached
git log -10 --pretty=format:'%h %s'
```

- untracked file も読み、変更目的を推測だけで決めない。
- ユーザーの変更と自分の変更が混在し得るものとして扱う。
- 生成物、秘密情報、環境ファイルが含まれていないか確認する。
- ユーザーが計画やメッセージ案だけを求めた場合は、Git の index や履歴を変更しない。

## 2. コミット計画を作る

各コミットを「1つの目的を、単独で説明・レビュー・取り消しできる変更」にする。ファイル数ではなく責務と依存関係で分ける。

分ける候補:

- 独立した機能とバグ修正。
- 振る舞いを変えないリファクタリングと、振る舞いを変える実装。
- アプリケーション変更と、独立した開発設定・ドキュメント変更。
- 互いに独立して検証・revert できる複数機能。

同じコミットに保つ候補:

- 実装と、その実装を直接検証するテスト。
- D1 migration と、それを必要とする最小限の Worker 実装。
- 共有スキーマ、API 実装、API client のように、分けると途中コミットが型エラーまたは動作不能になる垂直変更。
- rename と、その rename に必須の参照更新。

次の分け方を避ける。

- Web/Worker というフォルダだけを理由に、1機能を壊れた中間状態へ分ける。
- 同じ目的の小さな変更を、レビュー価値のない細粒度へ分ける。
- 無関係な整形やリファクタリングを機能コミットへ混ぜる。
- 依存するコミットより先に、その利用側だけをコミットする。

計画では各コミットの目的、対象ファイルまたは hunk、予定メッセージ、必要な検証を示す。境界が不明確なら、ステージング前にユーザーへ選択肢を示す。

## 3. メッセージを書く

このリポジトリの履歴に合わせ、英語の命令形で書く。Conventional Commits の prefix は、ユーザーが指定しない限り追加しない。

- subject は `Add`、`Fix`、`Refactor`、`Update`、`Remove` などで始める。
- subject は変更対象と成果が分かる具体性を持たせ、72文字以内、末尾ピリオドなしにする。
- `fix ui`、`Bug fix`、`Update file.tsx` のように目的が分からない表現を避ける。
- 小さく明白な変更は subject だけにする。
- 複数層にまたがる機能、非自明な制約、移行理由がある場合は空行の後に body を付ける。
- body は「何をしたか」の羅列より、変更理由、ユーザーに見える挙動、重要な制約を説明する。

例:

```text
Add project-specific Codex rules and development skills
```

```text
Fix JST boundary handling for reservation processing

Normalize reservation dates before state transitions so midnight jobs
use the same business date as the booking validation path.
```

## 4. 明示的にステージングする

- `git add .` や `git add -A` を避け、計画した path を `git add -- <paths>` で追加する。
- 1ファイルに複数目的がある場合は `git add -p` を使う。分割した hunk が構文的に不完全にならないよう確認する。
- 各コミット前に `git diff --cached --stat` と `git diff --cached` を読み直す。
- staged diff に別コミットの変更、秘密情報、生成物が入っていたら commit せず、index だけを安全に修正する。
- 作業ツリー側の未ステージ変更を削除・上書きしない。

## 5. 検証してコミットする

- `$verify` を使い、コミット単位に適切な最小検証を行う。
- 各コミットが可能な限り type-check 可能で、履歴を bisect できる状態にする。
- commit hook が失敗したら原因を直し、`--no-verify` で迂回しない。
- ユーザーがコミット実行まで明示した場合だけ `git commit` を実行する。
- amend、rebase、reset、push は、ユーザーがその操作を明示しない限り実行しない。

複数行メッセージは、安全な引数指定で作成する。

```bash
git commit -m "Subject" -m "Body"
```

## 6. 結果を確認する

コミットごとに `git show --stat --oneline HEAD` を確認し、最後に `git status --short` を確認する。完了報告には次を含める。

- 作成した commit hash と subject。
- 各コミットに含めた変更の要約。
- 実行した検証と結果。
- 意図的に未コミットのまま残したファイル。
