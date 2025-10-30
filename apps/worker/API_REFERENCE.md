# Worker API リファレンス

最終更新日: 2025-01-28

## 概要

このドキュメントは `apps/worker` 以下で実装されている Cloudflare Worker (Hono ベース) の HTTP API を対象としたリファレンスです。すべてのエンドポイントは同一のベース URL (`https://<your-worker-domain>`) を共有し、Cookie ベースのセッション認証を使用します。

### バインディング / 環境変数

Worker は以下の `Bindings` を前提としています。

| キー | 説明 |
| --- | --- |
| `DB` | Cloudflare D1 Database インスタンス |
| `AUTH_SECRET` | JWT 署名に利用する秘密鍵 |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth クライアント |
| `CORS_ORIGIN` | 許可するオリジンのカンマ区切りリスト |
| `FRONTEND_URL` | フロントエンドアプリのルート URL |
| `NODE_ENV` | `production` であれば Cookie を `Secure` 化 |
| `AUTH_URL` | Worker 自身のパブリック URL (OAuth コールバックに利用) |

## 認証と権限

- すべての API は `auth_token` Cookie によるセッション認証を要求します（一部の `/auth` エンドポイントを除く）。
- `requireAuth` ミドルウェアが Cookie 検証・ユーザー取得・`c.set('user', ...)` を実施します。失敗時は `401` で `NO_AUTHENTICATION_TOKEN`、`INVALID_TOKEN`、`USER_NOT_FOUND` 等を返却します。
- 管理者権限チェックは `requireAdmin` を使用し、ユーザーの `role` が `MBR` 以外の場合に許可されます。

### Google OAuth フロー

| メソッド | パス | 説明 |
| --- | --- | --- |
| `POST` | `/auth/signin/google` | PKCE 付き Google サインイン開始。`authUrl` を返し、`oauth_state` `pkce_verifier` `oauth_nonce` Cookie を設定。 |
| `GET` | `/auth/callback/google` | Google からのコールバック。ユーザー存在確認・JWT 発行後、`FRONTEND_URL/auth/callback` へリダイレクト。 |
| `GET` | `/auth/session` | 有効な Cookie があればユーザー情報を JSON で返却。未認証時は `{ "user": null }`。 |
| `POST` | `/auth/signout` | `auth_token` Cookie を削除し `{ "success": true }` を返却。 |

発行される JWT (`auth_token`) には以下のクレームが含まれます。

```json
{
  "sub": "<user-id>",
  "email": "<email>",
  "name": "<display-name>",
  "nickname": "<nickname|null>",
  "picture": "<avatar-url?>",
  "iat": 1730112000,
  "exp": 1730716800
}
```

## 共通レスポンス仕様

- 基本形: `{ "success": boolean, "data"?: any, "message"?: string, "error"?: string }`
- 作成・更新・キャンセル系エンドポイントは `{ "success": true }` のみを返します（余計なデータやメッセージは返しません）。
- 失敗時の主なエラーコード: `INTERNAL_SERVER_ERROR`, `INSUFFICIENT_PERMISSIONS`, `INVALID_INPUT`, `RESERVATION_CONFLICT` など。
- バリデーションエラー時は通常 `400 Bad Request` が返り、`error` に識別子が設定されます。

### 正常・異常レスポンス例

取得系の例:
```json
{
  "success": true,
  "data": [
    { "id": "...", "title": "..." }
  ]
}
```

作成/更新/削除/キャンセル系の例:
```json
{ "success": true }
```

異常系の例 (入力不正):
```json
{ "success": false, "error": "INVALID_INPUT" }
```

異常系の例 (権限なし):
```json
{ "success": false, "error": "INSUFFICIENT_PERMISSIONS" }
```

## エンドポイント詳細

### Users

#### GET `/me`
- 認証必須。
- ログイン中ユーザーの詳細を返却。`instruments` は文字列配列 (例: `["VO","GT"]`)。
- 応答例:
```json
{
  "success": true,
  "data": {
    "id": "user-uuid",
    "email": "example@school.ac.jp",
    "name": "山田 太郎",
    "nickname": "たろう",
    "instruments": ["VO"],
    "grade": 2,
    "role": "MBR",
    "created_at": "2024-04-01T00:00:00.000Z",
    "updated_at": "2025-03-01T10:00:00.000Z",
    "student_number": "EXAMPLE"
  }
}
```

#### PUT `/me`
- 認証必須。
- リクエストボディ (`UpdateUserRequestSchema`):
```json
{
  "nickname": "任意のニックネーム",
  "instruments": ["VO","GT"]
}
```
- `nickname` 変更時は新しい JWT が再発行され Cookie にセットされます。
- レスポンス: `{ "success": true }` のみ。

### Groups

#### POST `/groups`
- 認証必須。管理者権限不要（任意ユーザーが利用可能）。
- ボディ (`CreateGroupRequestSchema`):
```json
{
  "name": "Band A",
  "is_main": true,
  "assignments": {
    "VO": "user-id-1",
    "GT": "user-id-2"
  }
}
```
- `assignments` は `"楽器コード": "user_id"` のマップ。省略時は空のまま作成。
- レスポンス: `{ "success": true }` のみ。

#### GET `/groups`
- 認証必須。
- クエリ `admin=true` を付けると全グループ取得 (管理者権限が必要)。付けない場合は所属グループのみ。
- 返却データは各グループに `assignments` 配列が付き、要素は `{ "id": "<user-id>", "instruments": ["VO","GT"] }`。

#### GET `/me/groups/select`
- 認証必須。
- ログインユーザーが所属する有効なグループの `id`, `name`, `is_main` を返却。予約ダイアログ向け。

#### GET `/members/select`
- 認証必須。
- 全ユーザーの軽量一覧。各要素は `{ "id": "<user-id>", "name": "<nickname||name>", "instruments": ["VO", ...] }`。

#### PUT `/groups/:id`
- 認証必須。
- ボディ (`UpdateGroupRequestSchema`):
```json
{
  "name": "Band A",
  "is_main": false,
  "is_active": true,
  "assignments": {
    "VO": "user-id-1"
  }
}
```
- `assignments` を指定すると既存の割り当ては全削除後に再登録されます。
- レスポンス: `{ "success": true }` のみ。

### Members

| メソッド/パス | 認証 | 説明 |
| --- | --- | --- |
| `GET /members` | 必須 | 全メンバーと所属グループ名の一覧。`groups` は文字列配列。 |
| `POST /members` | 管理者のみ | リクエスト: `{ "name": "...", "email": "...", "grade": 1-6 }`。新規ユーザーを `role: MBR` で登録。レスポンス: `{ "success": true }` |
| `PUT /members/:id` | 管理者のみ | リクエスト: `{ "nickname": string, "grade": number, "instruments": string[], "role": enum }`。レスポンス: `{ "success": true }` |
| `DELETE /members/:id` | 管理者のみ | ユーザー削除。存在しない場合は `404 MEMBER_NOT_FOUND`。 |

### Reservations

#### GET `/reservations`
- 認証必須。
- 取得範囲: 作成時点から過去 14 日間を除いたデータ。`PENDING` / `CONFIRMED` は常に、その他は本人または所属グループのもの。
- レスポンスオブジェクト: `cancellable` は `0/1` の数値フラグ。

#### POST `/reservations`
- 認証必須。
- ボディ (`CreateReservationRequestSchema`): 当日内で最短 10 分・最長 4 時間・06:00〜23:00 の範囲に制限。
```json
{
  "start_time": "2025-11-01T09:00:00.000Z",
  "end_time": "2025-11-01T11:00:00.000Z",
  "group_id": "group-uuid?"
}
```
- レスポンス: `{ "success": true }` のみ。
- 備考: 当日予約は内部的に即時判定を行いますが、レスポンスでは詳細を返しません。必要に応じて取得系 API を再読込して最新状態を反映してください。

#### POST `/reservations/:id/cancel`
- 認証必須。
- 本人または所属グループの代表者が `PENDING` / `CONFIRMED` の予約をキャンセル可能。
- レスポンス: `{ "success": true }` のみ。

### Entries

#### POST `/entries`
- 認証必須。
- リクエスト (`CreateEntryRequestSchema`):
```json
{
  "event_id": "event-uuid",
  "group_ids": ["group-a", "group-b"]
}
```
- ログインユーザーが所属するグループのみ登録対象。重複エラー (`UNIQUE constraint`) は無視されます。
- レスポンス: `{ "success": true }` のみ。

#### GET `/entries`
- 認証必須。
- クエリ `event_id` を付けた場合は対象イベントかつ所属グループのエントリーを返却。未指定時は所属グループのすべてを返却。

#### DELETE `/entries/:id`
- 認証必須。
- エントリーの `group_id` がユーザー所属グループでない場合は `403 INSUFFICIENT_PERMISSIONS`。

### Setlist

| メソッド/パス | 認証 | 備考 |
| --- | --- | --- |
| `POST /setlist` | 必須 | ボディ: `{ "entry_id": "...", "position": number, "title": "...", "artist": "...", "admin"?: true }`。`admin:true` は管理者権限チェックを実行。レスポンス: `{ "success": true }` |
| `GET /setlist/entry/:entryId` | 必須 | 指定エントリーの曲順を `position` 昇順で返却。 |
| `PUT /setlist/:id` | 必須 | 任意のフィールドを更新。`admin:true` を含めると管理者モード。 |
| `DELETE /setlist/:id` | 必須 | クエリ `admin=true` で管理者削除。未指定なら所属グループチェック。 |

作成・更新のレスポンスはいずれも `{ "success": true }` のみ。

`position` は前後関係維持用の数値です。`title` と `artist` は必須、`artist` は更新時のみ省略可。

### Archive

| メソッド/パス | 認証 | 備考 |
| --- | --- | --- |
| `GET /archive` | 必須 | 全アーカイブを年降順で取得。 |
| `POST /archive` | 管理者 | ボディ: `{ "title": string, "youtube_url"?: string, "year": number }`。レスポンス: `{ "success": true }` |
| `PUT /archive/:id` | 管理者 | 存在しない場合は `404 ARCHIVE_NOT_FOUND`。レスポンス: `{ "success": true }` |
| `DELETE /archive/:id` | 管理者 | 削除成功で `{ "message": "Archive deleted successfully" }`。 |

`youtube_url` は任意。空文字が保存される場合があります。

### Events

| メソッド/パス | 認証 | 説明 |
| --- | --- | --- |
| `POST /events` | 管理者 | ボディ: `{ title, event_date, entry_deadline, is_entry_accepting, setlist_deadline, is_setlist_accepting, group_limit, song_limit }`。日付順 (`entry_deadline < setlist_deadline < event_date`) を満たさないと `400 INVALID_DATE_ORDER`。レスポンス: `{ "success": true }` |
| `GET /events` | 必須 | イベント一覧。`is_entry_accepting` / `is_setlist_accepting` は boolean として返却。 |
| `PUT /events/:id` | 管理者 | グループ上限が減った場合は超過分のエントリーを削除。`song_limit` 未指定時は既存値を維持。レスポンス: `{ "success": true }` |
| `DELETE /events/:id` | 管理者 | 対象イベントおよび紐付くエントリー(外部キー設定に依存)を削除。 |

作成・更新のレスポンスはいずれも `{ "success": true }` のみ。

`group_limit = 0` に更新するとイベントの全エントリーが削除されます。

## 予約バッチ処理

Worker には `0 15 * * *` (UTC 15:00 実行) の Cron トリガーが登録されており、`processDailyReservations` が以下を行います。

- 当日 `PENDING` 状態の予約を取得。
- `processReservationState` で空き時間を算出し、重複がなければ `CONFIRMED`、空きが無ければ `DECLINED`、一部空きのみの場合は時間帯を調整して更新。

当日手動で作成された予約も同じロジックで即時判定されます。

## 付録: 主要スキーマと列挙値

- 楽器コード: `VO` (Vocal), `GT` (Guitar), `KEY` (Keyboard), `DR` (Drums), `BA` (Bass)。
- 役割 (`role`): `MGR`, `CHF`, `MAC`, `MBR`, `ADM`, `NHD`, `NAC`。`requireAdmin` は `MBR` 以外を管理者扱い。
- 予約ステータス: `PENDING`, `WITHDRAWN`, `DECLINED`, `CONFIRMED`, `CANCELLED`, `COMPLETED` (主に取得時に使用)。

---

本ドキュメントはソースコード (`apps/worker/src`) に基づくため、実装変更時は合わせて更新してください。作成・更新・削除・キャンセル系のレスポンス最小化方針により、クライアントは処理結果の詳細が必要な場合でも GET 等の取得系リクエストで状態を再取得する前提となります。
