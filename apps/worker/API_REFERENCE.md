# Worker API リファレンス

最終更新日: 2025-10-31

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
| `POST` | `/auth/signin/google/onetap` | Google One Tap の credential JWT を検証し、許可済みユーザーなら `auth_token` Cookie を発行。 |
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

#### GET `/me/groups/select`
- 認証必須。
- ログインユーザーが所属する有効 (`is_active = true`) なグループを軽量形式で返却します。
- レスポンス例:
```json
{
  "success": true,
  "data": [
    { "id": "group-uuid", "name": "Band A", "is_main": true }
  ]
}
```
- 主に予約ダイアログでの名義選択に利用されます。

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
- クエリ `admin=true` を付けると全グループ取得 (管理者権限が必要)。付けない場合はログインユーザーが所属するグループのみ。
- 応答は `is_main`, `is_active` などテーブルの生データに加え、`assignments` 配列（`{ "id": "<user-id>", "instruments": ["VO","GT"] }`）を含みます。

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
| `POST /members/bulk` | 管理者のみ | 複数ユーザーを一括登録。重複メールは `failed` 配列にエラーとして返却。レスポンス: `{ "success": true, "data": { "created": string[], "failed": [{ "email": string, "error": string }] } }` |
| `GET /members/select` | 必須 | 予約・エントリー用の軽量リスト。要素は `{ "id": string, "name": string, "instruments": string[] }`。 |

`POST /members/bulk` は入力内の重複メールを `DUPLICATE_IN_INPUT`、既存ユーザーを `EMAIL_ALREADY_EXISTS` として `failed` 配列にまとめて返却します。

### Reservations

#### GET `/reservations`
- 認証必須。
- 取得対象は「開始時刻が現在から14日以内」かつ以下条件のいずれかを満たす予約。
  - `state` が `PENDING` または `CONFIRMED`
  - 予約者本人 (`user_id`) と一致
  - ログインユーザーが所属するグループの予約
- 各要素には `user_name`, `group_name`, `cancellable`（0/1 フラグ）が含まれます。`cancellable=1` の場合のみキャンセル API が実行可能です。

#### POST `/reservations`
- 認証必須。
- リクエスト (`CreateReservationRequestSchema`):
  - 日付をまたがないこと
  - 利用時間は最短10分 / 最長4時間
  - 利用時間帯は 06:00〜23:00（JST 基準）
  - `group_id` を指定した場合は、そのグループが `is_active = true` であり、ログインユーザーが所属している必要があります。`admin: true` を指定した管理者は所属していないアクティブグループや予約禁止期間内の時間帯も指定できます
- 同日内の予約は送信直後に `processReservationState` が実行され、空きがあれば `CONFIRMED`、部分的な空きは時間帯を調整したうえで `CONFIRMED`、空きがなければ `DECLINED` で保存されます。未来日の予約は `PENDING` で登録され、予約日の午前0時（JST）のバッチで判定されます。
- 正常時のレスポンスは `{ "success": true }`。主なエラー:
  - `INVALID_RESERVATION_TIME`: 時刻バリデーション違反
  - `GROUP_NOT_FOUND`: `group_id` が存在しない／非アクティブ
  - `NOT_GROUP_MEMBER`: グループ所属権限が無い
  - `RESERVATION_CONFLICT`: ユニーク制約違反（既存レコードと完全重複）

#### POST `/reservations/:id/cancel`
- 認証必須。
- `PENDING` または `CONFIRMED` の予約のみキャンセル可能。予約者本人か、同じグループに所属しているユーザーが実行できます。
- 制限に抵触する場合は `403 RESERVATION_CANNOT_BE_CANCELLED` を返します。

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
- ログインユーザーが所属するグループのみ登録対象。イベントがエントリー受付中 (`is_entry_accepting = true`) で、締切 `entry_deadline` を過ぎていないことを確認します。
- `group_limit` が設定されているイベントでは、同一メンバーが許容上限を超えてエントリーしないかを検証し、超過するメンバー名を `members` 配列としてエラーレスポンスに含めます。
- 既に同じエントリーが存在している場合はユニーク制約で弾かれますが、処理内で握り潰され成功レスポンスになります。
- 正常時のレスポンスは `{ "success": true }`。

#### GET `/entries`
- 認証必須。
- クエリ `event_id` を付けた場合は対象イベントかつ所属グループのエントリーを返却。未指定時は所属グループのすべてを返却。

#### DELETE `/entries/:id`
- 認証必須。
- エントリーの `group_id` がユーザー所属グループでない場合は `403 INSUFFICIENT_PERMISSIONS`。

### Setlist

| メソッド/パス | 認証 | 説明 |
| --- | --- | --- |
| `POST /setlist` | 必須 | ボディ: `{ "entry_id": string, "position": number, "title": string, "artist": string, "admin"?: true }`。`admin:true` を指定すると管理者権限を要求。イベントがセットリスト受付中 (`is_setlist_accepting`) かつ締切前であることを確認します。 |
| `PUT /setlist?entryId=<id>` | 必須 | ボディ: `{ "items": [{ "title": string, "artist"?: string }], "hasSE": boolean, "admin"?: true }`。エントリーのセットリストを丸ごと置換し、`hasSE=true` の場合は位置0にSE曲を保存します。`song_limit` を超えると `400 SONG_LIMIT_EXCEEDED`。 |
| `GET /setlist/event/:eventId` | 必須 | エントリーごとのセットリストをまとめて返却。各要素に `entry`, `group_name`, `setlist_items` を含みます。 |

`POST` / `PUT` 成功時のレスポンスはいずれも `{ "success": true }`。利用者モードではエントリーが自身の所属グループに紐づいている必要があります。

### Timeline

| メソッド/パス | 認証 | 説明 |
| --- | --- | --- |
| `GET /timeline/event/:eventId` | 必須 | 指定イベントの進行表を `configured`（位置が設定済み）と `unconfigured` に分けて返却します。要素は `entry_id`, `group_id`, `group_name`, `start_time`, `end_time`, `position` などを含みます。 |
| `PUT /timeline/event/:eventId` | 管理者のみ | ボディ: `{ "items": [{ "entry_id": string, "position": number|null, "start_time"?: string|null, "end_time"?: string|null }] }` を想定。重複ポジションや欠番、終了時刻≦開始時刻は `400`。存在しないエントリー指定時は `404 ENTRY_NOT_FOUND`。 |

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

Worker は Cron トリガーを利用した自動処理を実装しています。

- `0 15 * * *`（UTC 15:00 = JST 00:00）: `processDailyReservations` が当日分の `PENDING` 予約を取得し、`processReservationState` により重複検出・部分調整を実施したうえで `CONFIRMED` / `DECLINED` を更新します。
- `0 16 * * *`（UTC 16:00 = JST 01:00、トリガー登録時）: `deleteExpiredEvents` が開催から2日経過したイベントを削除し、紐づくバンドを `is_active = false` に更新します。

同日の予約は作成時に即時判定されるため、Cron 処理では未来日から当日に切り替わった予約のみが評価対象となります。

## 付録: 主要スキーマと列挙値

- 楽器コード: `VO` (Vocal), `GT` (Guitar), `KEY` (Keyboard), `DR` (Drums), `BA` (Bass)。
- 役割 (`role`): `MGR`, `CHF`, `MAC`, `MBR`, `ADM`, `NHD`, `NAC`。`requireAdmin` は `MBR` 以外を管理者扱い。
- 予約ステータス: `PENDING`, `WITHDRAWN`, `DECLINED`, `CONFIRMED`, `CANCELLED`, `COMPLETED` (主に取得時に使用)。

---

本ドキュメントはソースコード (`apps/worker/src`) に基づくため、実装変更時は合わせて更新してください。作成・更新・削除・キャンセル系のレスポンス最小化方針により、クライアントは処理結果の詳細が必要な場合でも GET 等の取得系リクエストで状態を再取得する前提となります。
