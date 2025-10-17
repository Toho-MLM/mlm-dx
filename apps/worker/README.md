# MLM-DX Worker Backend

Cloudflare Workersを使用したMLM-DXのバックエンドAPIです。

## セットアップ

```bash
npm install
```

## 開発サーバーの起動

### ローカル開発（推奨）
```bash
npm run dev
```

### リモート開発
```bash
npm run dev:remote
```

## デプロイ

### 本番環境
```bash
npm run deploy
```

### 開発環境
```bash
npm run deploy:dev
```

## データベース管理

データベーススキーマは`schema.sql`ファイルに統一されています。このファイルにはテーブル定義、インデックス、サンプルデータがすべて含まれています。

### 本番データベース
```bash
npm run db:create      # D1データベースの作成
npm run db:migrate      # スキーマの実行（テーブル作成 + サンプルデータ投入）
npm run db:setup        # 上記を全て実行
```

### 開発データベース
```bash
npm run db:create:dev   # 開発用D1データベースの作成
npm run db:migrate:dev  # 開発用スキーマの実行
npm run db:setup:dev    # 上記を全て実行
```

### ローカルデータベース
```bash
npm run db:migrate:local  # ローカルスキーマの実行
npm run db:setup:local    # ローカルスキーマの実行
```

### スキーマファイル
- `schema.sql` - 統一されたデータベーススキーマ
  - テーブル定義（users, groups, group_members, reservations, archive）
  - インデックス定義
  - サンプルデータ（INSERT OR IGNORE）

## 環境変数

### Google OAuth設定

1. [Google Cloud Console](https://console.cloud.google.com/)でプロジェクトを作成
2. OAuth 2.0クライアントIDを作成
3. 認証済みリダイレクトURIを追加:
   - 開発環境: `http://localhost:8787/api/auth/callback/google`
   - 本番環境: `https://your-worker-domain.workers.dev/api/auth/callback/google`

### wrangler.toml設定

`wrangler.toml`ファイルで以下の環境変数を設定してください：

#### 本番環境
```toml
[vars]
AUTH_SECRET="your-auth-secret-here-min-32-chars-long"
CORS_ORIGIN="https://your-frontend-domain.com"

[env.production.vars]
GOOGLE_CLIENT_ID="your-production-google-client-id"
GOOGLE_CLIENT_SECRET="your-production-google-client-secret"
```

#### 開発環境
```toml
[env.development.vars]
AUTH_SECRET="dev-auth-secret-here-min-32-chars-long-for-development"
CORS_ORIGIN="http://localhost:3000"
GOOGLE_CLIENT_ID="your-dev-google-client-id"
GOOGLE_CLIENT_SECRET="your-dev-google-client-secret"
```

**注意**: `AUTH_SECRET`は最低32文字以上のランダムな文字列である必要があります。
生成するには: `openssl rand -base64 32`

## API エンドポイント

### 認証（JWT）
- `GET /auth/google` - Googleログイン開始（callbackクエリ必須）
- `GET /api/auth/callback/google` - Google認証コールバック→JWT発行→callbackへ`token`付与でリダイレクト
- `GET /api/users/me` - AuthorizationのJWTから自分の情報を返す

### ユーザー管理
- `GET /api/users/fetch/:email` - ユーザー情報取得
- `PUT /api/users/update` - ユーザー情報更新
- `GET /api/users/groups` - ユーザーのグループ一覧
- `GET /api/users/holder` - 予約ホルダー情報

### グループ管理
- `GET /api/groups` - グループ一覧
- `POST /api/groups/upsert` - グループ作成/更新
- `GET /api/groups/:id` - グループ詳細
- `PUT /api/groups/:id` - グループ更新
- `DELETE /api/groups/:id` - グループ削除

### メンバー管理
- `GET /api/members/fetch` - メンバー一覧
- `GET /api/members/list` - メンバーリスト
- `GET /api/members/nickname/:id` - ニックネーム取得
- `GET /api/members/group/:groupId` - グループメンバー
- `POST /api/members/group/:groupId` - メンバー追加
- `DELETE /api/members/group/:groupId/:userId` - メンバー削除

### 予約管理
- `GET /api/reservations/fetch` - 予約一覧
- `GET /api/reservations/user` - ユーザー予約
- `GET /api/reservations/group/:groupId` - グループ予約
- `POST /api/reservations/create` - 予約作成
- `PUT /api/reservations/cancel/:id` - 予約キャンセル

### アーカイブ管理
- `GET /api/archive/group/:groupId` - アーカイブ一覧
- `POST /api/archive/group/:groupId` - アーカイブ追加
- `PUT /api/archive/:id` - アーカイブ更新
- `DELETE /api/archive/:id` - アーカイブ削除
