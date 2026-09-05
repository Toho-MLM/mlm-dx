# Worker API リファレンス

最終更新日: 2026-08-19

## 概要

このドキュメントは `apps/worker` 以下で実装されている Hono API を対象としたリファレンスです。統合Worker `dx` の同一originでCookieベースのセッション認証を使用します。

以下の表に記載するHono内部パスは、公開時にはすべて先頭へ `/api` を付けます。たとえばセッションは `GET /api/auth/session`、Google OAuth callbackは `GET /api/auth/callback/google` です。`/api` のない旧公開パスは提供しません。

### バインディング / 環境変数

Worker は以下の `Bindings` を前提としています。

| キー | 説明 |
| --- | --- |
| `DB` | Cloudflare D1 Database インスタンス |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth クライアント |
| `CORS_ORIGIN` | 許可するオリジンのカンマ区切りリスト |
| `FRONTEND_URL` | フロントエンドアプリのルート URL |
| `NODE_ENV` | 実行環境の識別子 |
| `AUTH_URL` | Worker 自身のパブリック URL (OAuth コールバックに利用) |

## 認証と権限

- すべての API は不透明なセッション Cookie による認証を要求します（一部の `/auth` エンドポイントを除く）。HTTPS では `__Host-mlm_dx_session`、ローカル HTTP 開発では `mlm_dx_session` を使用します。
- Cookie は `HttpOnly`、HTTPS では `Secure`、`SameSite=Lax`、`Path=/` とし、有効期間は7日です。Cookie には256ビットのランダム値だけを保存し、D1 の `auth_sessions` には SHA-256 ハッシュだけを保存します。
- `requireAuth` ミドルウェアが D1 上の有効期限とユーザーを検証し、`c.set('user', ...)` を実施します。失敗時は `401` で `NO_AUTHENTICATION_TOKEN` または `INVALID_SESSION` を返却します。
- `POST`、`PUT`、`PATCH`、`DELETE` は同一 origin または `CORS_ORIGIN` に列挙された origin だけを許可します。
- 管理者権限チェックは `requireAdmin` を使用し、ユーザーの `role` が `MBR` 以外の場合に許可されます。

### Google OAuth フロー

| メソッド | パス | 説明 |
| --- | --- | --- |
| `POST` | `/auth/signin/google` | PKCE 付き Google サインイン開始。`authUrl` を返し、`oauth_state` `pkce_verifier` `oauth_nonce` Cookie を設定。 |
| `POST` | `/auth/signin/google/onetap` | Google One Tap の ID token を検証し、許可済みユーザーならサーバー側セッションを発行。 |
| `GET` | `/auth/callback/google` | Google からのコールバック。ユーザー存在確認・サーバー側セッション発行後、`FRONTEND_URL/auth/callback` へリダイレクト。 |
| `GET` | `/auth/session` | 有効な Cookie があればユーザー情報を JSON で返却。未認証時は `{ "user": null }`。 |
| `POST` | `/auth/signout` | D1 のセッションを失効させて Cookie を削除し、`{ "success": true }` を返却。 |

ログイン、セッション確認、保護 API、ログアウトのすべてで `auth_sessions` を一次情報とします。ユーザー属性や権限は Cookie に格納せず、リクエストごとに D1 の最新値を取得します。

## 共通レスポンス仕様

- DBエンティティのIDはUUID形式です。パス・クエリ・リクエストボディで数値文字列などUUID以外のIDを指定した場合は、入力エラーとして拒否します。
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
- `nickname` 変更後は、次のリクエストから D1 の最新値が反映されます。
- レスポンス: `{ "success": true }` のみ。

#### GET `/me/email-notification-preferences`
- 認証必須。
- 内部・外部予約で共通のメール通知設定を返却します。
- レスポンス例:
```json
{
  "success": true,
  "data": {
    "RESERVATION_RECEIVED": true,
    "RESERVATION_CONFIRMED": true,
    "RESERVATION_EDITED": true,
    "RESERVATION_ADJUSTED": true,
    "RESERVATION_DECLINED": true,
    "RESERVATION_CANCELLED": true,
    "RESERVATION_REVOKED": true
  }
}
```

#### PUT `/me/email-notification-preferences/:type`
- 認証必須。
- `type` は上記7種類のいずれかを指定します。
- `RESERVATION_EDITED` は予約者自身による予約変更、`RESERVATION_ADJUSTED` は予約者の意思によらない変更を表します。
- リクエストボディ: `{ "enabled": boolean }`。
- レスポンス: `{ "success": true }` のみ。
- 団体予約では、予約者が対象通知をOFFにしていても、通知ONの団体メンバーがいる場合は予約者を `To`、対象メンバーを `Cc` として送信します。全員OFFの場合は送信しません。

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
- 一般メンバーは、所属する本バンドでは `assignments` を省略した名称変更のみ可能です。`is_main` と `is_active` は現在値を指定する必要があります。
- レスポンス: `{ "success": true }` のみ。

#### PUT `/groups/active`
- 管理者のみ。
- ボディ: `{ "ids": ["group-uuid"], "is_active": true }`。1〜100件のバンドを一括で有効化または無効化します。
- 指定IDが1件でも存在しない場合は `404 GROUP_NOT_FOUND` とし、更新しません。
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
  - `group_id` を指定した場合は、そのグループが `is_active = true` であり、ログインユーザーが所属している必要があります。`admin: true` を指定した管理者は所属していないアクティブグループを指定できますが、予約禁止期間内の時間帯は指定できません
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

#### DELETE `/reservations/:id`
- 管理者のみ実行できます。
- 予約の状態を変更するのではなく、対象レコードをDBから完全に削除します。
- 存在しない予約は `404 RESERVATION_NOT_FOUND`、UUID形式でないIDは `400 INVALID_INPUT` を返します。

#### DELETE `/reservations/external/:id`
- 管理者のみ実行できます。
- 外部予約の状態を変更するのではなく、対象予約と紐づく利用実績をDBから完全に削除します。
- 存在しない予約は `404 RESERVATION_NOT_FOUND`、UUID形式でないIDは `400 INVALID_INPUT` を返します。

#### POST `/reservations/external` / PUT `/reservations/external/:id`
- 外部予約は最短10分・最長4時間で、選択した外部スタジオの時間枠内に収まる必要があります。
- 6:00〜23:00と同日内の制限は適用せず、スタジオの時間枠内であれば日付をまたいで予約できます。

#### GET `/reservation/external/studios` / POST `/reservation/external/studios/bulk`
- 認証必須。管理用の抽選対象を返します。`target_type` は `HALL` または `EXTERNAL` です。
- 作成は管理者のみです。ホールは同一JST日内の6:00〜23:00に30分以上で設定し、`draw_date` で抽選実行日を指定します。抽選は指定日の21:00 JSTに実行され、既存のホール抽選対象と時間が重複する場合は拒否します。
- 既存の外部スタジオ行は migration により `EXTERNAL` として保持されます。
- ホール対象を削除すると、未処理申込を閉じ、当選済みで利用前のホール予約を `DECLINED` にして取消通知を送ります。

#### GET `/reservations/external/lottery`
- 認証必須。ホールと外部を含む抽選状況一覧用に、取り消されたものを除く全申込を返します。

#### POST `/reservations/external/lottery`
- 認証必須。`requested_duration_minutes`（30〜120分の整数）は必須です。
- `preferred_start_datetime` と `preferred_end_datetime` は任意ですが、指定する場合は両方必要です。
- 希望時間帯を指定しない場合、6:00〜23:00の制限は適用せず、外部スタジオの時間枠全体を抽選対象にします。

#### ホール予約の抽選期間制限
- `POST /reservations` と `PUT /reservations/:id` は、未抽選の `HALL` 対象時間と一部でも重なる場合、`LOTTERY_PERIOD_PROTECTED` で拒否します。管理者モードでは適用しません。
- 抽選後は、同時間帯の `PENDING` / `CONFIRMED` ホール予約と競合しない空き時間のみ通常予約できます。
- ホール当選は `reservations`、外部当選は `external_reservations` に `CONFIRMED` として保存されます。

#### 外部予約の抽選期間制限
- `POST /reservations/external/check`、`POST /reservations/external`、`PUT /reservations/external/:id` は、利用日の前日21:00に行う抽選が未実施で、かつ利用日が翌日〜14日先に含まれる場合、`EXTERNAL_LOTTERY_PERIOD_PROTECTED` で拒否します。
- 日付をまたぐ予約は、対象期間と一部でも重なる場合に拒否します。管理者モードではこの制限を適用しません。

#### POST `/reservations/unavailable`
- 管理者のみ実行できます。
- 新しい予約禁止期間と既存の `PENDING` / `CONFIRMED` 予約が一部だけ重なる場合、禁止部分を除いた最長の時間帯へ予約を短縮し、状態は維持します。この変更は `RESERVATION_ADJUSTED` 通知の対象です。
- 予約全体が禁止期間に含まれ、利用可能な時間が残らない場合は `DECLINED` に更新し、`RESERVATION_REVOKED` 通知の対象にします。

### Dashboard

#### GET `/dashboard`
- 認証必須。ログインユーザーに関係する今後14日間の情報を各5件まで返します。
- `member_actions`: 参加登録候補と、所属バンドのセットリスト未登録。
- `admin_actions`: `MBR` 以外のユーザーに限り、締切後も受付中のイベントと、直近イベントの出演順・開始・終了時刻の未設定を返します。
- `schedule_items`: 本人または所属バンドのホール・外部予約と、受付中イベントの出演・セットリスト締切。
- 取得時にエントリーやタイムラインを生成・更新することはありません。

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
- ログインユーザーが所属するグループのみ登録対象。登録可否はイベントのエントリー受付フラグ (`is_entry_accepting`) だけで判定します。`entry_deadline` は UI 表示用の参考時刻で、DB 上の締切日 0:00 を前日の締切として表示し、前日 23:59:59 までをカウントダウン対象にします。
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
- `0 16 * * *`（UTC 16:00 = JST 01:00、トリガー登録時）: `deleteExpiredEvents` が開催から2日経過したイベントを削除し、紐づく自由バンドを `is_active = false` に更新します。本バンドは有効なまま維持されます。

同日の予約は作成時に即時判定されるため、Cron 処理では未来日から当日に切り替わった予約のみが評価対象となります。

## 付録: 主要スキーマと列挙値

- 楽器コード: `VO` (Vocal), `GT` (Guitar), `KEY` (Keyboard), `DR` (Drums), `BA` (Bass)。
- 役割 (`role`): `MGR`, `CHF`, `MAC`, `MBR`, `ADM`, `NHD`, `NAC`。`requireAdmin` は `MBR` 以外を管理者扱い。
- 予約ステータス: `PENDING`, `WITHDRAWN`, `DECLINED`, `CONFIRMED`, `CANCELLED`, `COMPLETED` (主に取得時に使用)。

---

本ドキュメントはソースコード (`apps/worker/src`) に基づくため、実装変更時は合わせて更新してください。作成・更新・削除・キャンセル系のレスポンス最小化方針により、クライアントは処理結果の詳細が必要な場合でも GET 等の取得系リクエストで状態を再取得する前提となります。
