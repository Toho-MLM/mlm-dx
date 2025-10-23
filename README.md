# MLM-DX

MLM-DXは、バンド管理システムです。Next.jsフロントエンド（Cloudflare Pages）とCloudflare Workersバックエンド（D1/SQLite）で構成されています。

## プロジェクト構造

```
mlm-dx/
├── apps/
│   ├── web/          # Next.jsフロントエンド
│   └── worker/       # Cloudflare Workersバックエンド
├── package.json      # ルートレベルの設定
└── README.md
```

## セットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. Cloudflare D1データベースのセットアップ

#### ローカル開発環境
```bash
# ローカルD1データベースは自動的に作成されます（wrangler dev実行時）
# マイグレーションを実行
npm run db:migrate:local

# サンプルデータを投入（オプション）
npm run db:seed:local

# または一括でセットアップ
npm run db:setup:local
```

#### 本番環境（クラウド）
```bash
# 本番環境D1データベースを作成
npm run db:create:prod

# マイグレーションを実行
npm run db:migrate:prod

# サンプルデータを投入（オプション）
npm run db:seed:prod

# または一括でセットアップ
npm run db:setup:prod
```

### 3. Google OAuth設定

#### 3.1 Google Cloud Console でプロジェクトを作成

1. [Google Cloud Console](https://console.cloud.google.com/)にアクセス
2. 新しいプロジェクトを作成するか、既存のプロジェクトを選択

#### 3.2 OAuth 2.0 認証情報を設定

**OAuth同意画面の設定:**
1. 左側のメニューから「APIとサービス」→「OAuth同意画面」を選択
2. ユーザータイプを選択（外部を推奨）
3. アプリ情報を入力：
   - アプリ名: `MLM-DX`
   - ユーザーサポートメール: あなたのメールアドレス
   - デベロッパーの連絡先情報: あなたのメールアドレス
4. スコープの追加:
   - `.../auth/userinfo.email`
   - `.../auth/userinfo.profile`
5. テストユーザーを追加（開発中は必要）

**OAuth 2.0 クライアントIDの作成:**
1. 「認証情報」タブを選択
2. 「認証情報を作成」→「OAuth 2.0 クライアントID」を選択
3. アプリケーションの種類: `ウェブアプリケーション`
4. 名前: `MLM-DX Worker`
5. **承認済みのJavaScript生成元**を追加:

**開発環境:**
```
http://localhost:3000
http://127.0.0.1:3000
```

**本番環境:**
```
https://your-frontend-domain.com
```

6. **承認済みのリダイレクトURI**を追加:

**開発環境:**
```
http://localhost:8787/auth/callback/google
```

**本番環境:**
```
https://mlm-dx-worker.your-account.workers.dev/auth/callback/google
```

7. 「作成」をクリック
8. クライアントIDとクライアントシークレットをコピー

### 4. 環境変数の設定

#### 4.1 AUTH_SECRETの生成

ターミナルで以下のコマンドを実行:
```bash
openssl rand -base64 32
```

#### 4.2 フロントエンド（apps/web/.env.local）

**開発環境用の設定:**
```env
# 環境設定
NODE_ENV=development

# API設定
NEXT_PUBLIC_API_URL=http://localhost:8787
```

**本番環境用の設定:**
```env
# 環境設定
NODE_ENV=production

# API設定
NEXT_PUBLIC_API_URL=https://your-worker-domain.workers.dev
```

#### 4.3 バックエンド（apps/worker/.dev.vars）

**開発環境用の設定:**
```env
# 環境設定
NODE_ENV=development
AUTH_URL=http://localhost:8787

# 認証設定
AUTH_SECRET=your-auth-secret-min-32-chars-long
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# CORS設定
CORS_ORIGIN=http://localhost:3000
FRONTEND_URL=http://localhost:3000
```

#### 4.4 バックエンド（apps/worker/wrangler.toml）

```toml
name = "mlm-dx-worker"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[env.development]
name = "mlm-dx-worker-dev"

[env.production]
name = "mlm-dx-worker"

[[d1_databases]]
binding = "DB"
database_name = "mlm-dx-db"
database_id = "your-production-database-id"

[[env.development.d1_databases]]
binding = "DB"
database_name = "mlm-dx-db-dev"
database_id = "your-dev-database-id"

# 共通設定
[vars]
CORS_ORIGIN = "https://your-frontend-domain.com"
FRONTEND_URL = "https://your-frontend-domain.com"

# 本番環境設定（機密情報はwrangler secret putで管理）
[env.production.vars]
CORS_ORIGIN = "https://your-frontend-domain.com"
FRONTEND_URL = "https://your-frontend-domain.com"

# 開発環境設定（機密情報は.dev.varsファイルで管理）
[env.development.vars]
CORS_ORIGIN = "http://localhost:3000"
FRONTEND_URL = "http://localhost:3000"
```

#### 4.5 環境変数の詳細説明

**フロントエンド環境変数:**

| 変数名 | 説明 | 開発環境 | 本番環境 |
|--------|------|----------|----------|
| `NODE_ENV` | 環境設定 | `development` | `production` |
| `NEXT_PUBLIC_API_URL` | バックエンドAPIのURL | `http://localhost:8787` | `https://your-worker-domain.workers.dev` |

**バックエンド環境変数:**

| 変数名 | 説明 | 開発環境 | 本番環境 |
|--------|------|----------|----------|
| `NODE_ENV` | 環境設定（クッキーのsecure設定に影響） | `development` | `production` |
| `AUTH_URL` | 認証コールバック用のURL | `http://localhost:8787` | `https://your-worker-domain.workers.dev` |
| `AUTH_SECRET` | JWTトークンの署名用秘密鍵 | `.dev.vars`ファイル | `wrangler secret put` |
| `GOOGLE_CLIENT_ID` | Google OAuth クライアントID | `.dev.vars`ファイル | `wrangler secret put` |
| `GOOGLE_CLIENT_SECRET` | Google OAuth クライアントシークレット | `.dev.vars`ファイル | `wrangler secret put` |
| `CORS_ORIGIN` | CORS許可オリジン | `http://localhost:3000` | `https://your-frontend-domain.com` |
| `FRONTEND_URL` | フロントエンドのURL | `http://localhost:3000` | `https://your-frontend-domain.com` |

#### 4.6 機密情報の管理方法

**本番環境（wrangler secret put）:**
本番環境の機密情報は`wrangler secret put`コマンドで安全に管理します：

```bash
# 本番環境の機密情報を設定
wrangler secret put AUTH_SECRET --env production
wrangler secret put GOOGLE_CLIENT_ID --env production
wrangler secret put GOOGLE_CLIENT_SECRET --env production
```

**開発環境（.dev.varsファイル）:**
開発環境の機密情報は`apps/worker/.dev.vars`ファイルで管理します：

```env
AUTH_SECRET=your-dev-auth-secret-here-min-32-chars-long
GOOGLE_CLIENT_ID=your-dev-google-client-id
GOOGLE_CLIENT_SECRET=your-dev-google-client-secret
```

**注意事項:**
- `AUTH_SECRET`は最低32文字以上のランダムな文字列である必要があります
- `NODE_ENV`の設定により、クッキーの`secure`属性が自動的に制御されます（開発環境: `false`、本番環境: `true`）
- 開発環境と本番環境では**必ず異なる**クライアントIDとシークレットを使用してください
- 本番環境では`https`プロトコルを使用し、適切なドメインを設定してください
- 認証はワーカー側のみで実行され、フロントエンドはワーカー側の認証エンドポイントにリダイレクトします
- `.dev.vars`ファイルは`.gitignore`に追加して、バージョン管理から除外してください
- フロントエンドでは認証関連の環境変数は不要で、API接続URLのみ設定します

### 5. 開発サーバーの起動

#### ローカル開発（推奨）
```bash
# フルスタック開発環境を起動（全てローカル）
npm run dev

# または明示的にローカル環境を指定
npm run dev:local

# 個別に実行
npm run dev:web           # フロントエンド（Next.js）
npm run dev:worker:local  # バックエンド（Wrangler ローカル）
```

## デプロイ

### 本番環境へのデプロイ

#### フルスタックデプロイ
```bash
# 本番環境にフルスタックデプロイ
npm run deploy:all:prod
```
#### 個別デプロイ

**Cloudflare Workers:**
```bash
# 本番環境
npm run deploy:worker:prod
```

**Next.js（Cloudflare Pages）:**
```bash
# 本番環境
npm run deploy:web:prod
```

### ビルド

#### ローカルビルド（開発用）
```bash
# ローカル用ビルド
npm run build:local

# 個別ビルド
npm run build:web
npm run build:worker:local
```

### データベース管理

#### ローカル環境
```bash
# ローカルDB設定（マイグレーション + シード）
npm run db:setup:local

# 個別実行
npm run db:migrate:local
npm run db:seed:local

# CLIツールを使用したローカルDBセットアップ
cd apps/worker
wrangler d1 execute mlm-dx-db --file=./schema.sql --local
cd ../..
npm run seed -- sample --local
```

#### 本番環境（クラウド）
```bash
# 本番環境DB設定
npm run db:setup:prod

# 個別実行
npm run db:migrate:prod
npm run db:seed:prod
```

#### データベース管理CLI

**CLIツールの使用方法:**
`scripts/seed.js`はNode.jsで実行できるデータベース管理CLIツールです。UUIDやタイムスタンプは自動生成され、必要最低限の引数でデータベースを管理できます。

**基本的な使用方法:**
```bash
# npm runを使用する場合（推奨）
npm run seed -- user add --email="tanaka@example.com" --grade=3
npm run seed -- user remove --email="tanaka@example.com"
npm run seed -- user list
npm run seed -- user reset
npm run seed -- reservation reset
npm run seed -- groups reset

# 直接実行する場合
node scripts/seed.js user add --email="tanaka@example.com" --grade=3
node scripts/seed.js user remove --email="tanaka@example.com"
node scripts/seed.js user list
node scripts/seed.js user reset
node scripts/seed.js reservation reset
node scripts/seed.js groups reset

# ヘルプを表示
npm run seed -- --help
node scripts/seed.js --help
```

**重要**: npm runを使用する場合は、`--`を使って引数を分離してください。`--`がないと引数がnpm自体のオプションとして解釈されてしまいます。

**利用可能なテーブルとアクション:**

| テーブル | アクション | 説明 | 必須引数 |
|---------|-----------|------|----------|
| `user` | `add` | 新しいユーザーを追加 | `--email`, `--grade` |
| `user` | `remove` | ユーザーを削除 | `--email` |
| `user` | `list` | ユーザー一覧を表示 | なし |
| `user` | `reset` | データベース全体をリセット | なし |
| `reservation` | `reset` | 予約テーブルをリセット | なし |
| `groups` | `reset` | グループテーブルをリセット | なし |

**オプション引数:**

**ユーザー追加オプション:**
- `--email <email>` - メールアドレス
- `--grade <grade>` - 学年（1-6）
- `--role <role>` - ロール: `MGR,CHF,MAC,MBR,ADM,NHD,NAC`（デフォルト: `MBR`）

**ユーザー削除オプション:**
- `--email <email>` - メールアドレス

**グローバルオプション:**
- `--local` - ローカルデータベースを使用（デフォルト: 本番データベース）
- `--help` - ヘルプを表示

**使用例:**
```bash
# ユーザー管理
npm run seed -- user add --email="tanaka@example.com" --grade=3
npm run seed -- user add --email="admin@example.com" --grade=4 --role="ADM"
npm run seed -- user add --email="newbie@example.com" --grade=1 --role="NHD"
npm run seed -- user remove --email="tanaka@example.com"
npm run seed -- user list
npm run seed -- user reset

# 予約テーブルのリセット
npm run seed -- reservation reset

# グループテーブルのリセット
npm run seed -- groups reset

# ローカル環境で実行
npm run seed -- user add --email="test@example.com" --grade=2 --local
npm run seed -- user list --local
npm run seed -- user reset --local
npm run seed -- reservation reset --local
npm run seed -- groups reset --local

# 直接実行の例
node scripts/seed.js user add --email="admin@example.com" --grade=4 --role="ADM"
node scripts/seed.js user remove --email="test@example.com"
node scripts/seed.js user list
node scripts/seed.js user reset
node scripts/seed.js reservation reset
node scripts/seed.js groups reset
```

**注意事項:**
- UUIDとタイムスタンプは自動生成されます
- `INSERT OR IGNORE`を使用するため、重複データは作成されません
- 名前とニックネームはNULLで初期化されます
- 楽器は空配列`[]`で初期化されます
- Google OAuth認証時に名前がNULLの場合、Googleから取得した姓名情報が自動設定されます
- ロールは`['MGR','CHF','MAC','MBR','ADM','NHD','NAC']`のいずれかを使用してください
- メールアドレスは有効な形式である必要があります
- 学年は1-6の数値である必要があります
- `user reset`コマンドはデータベース全体を完全にリセットし、既存のデータは削除されます
- `reservation reset`コマンドは予約テーブルのデータのみを削除します
- `groups reset`コマンドはグループテーブルのデータのみを削除します
- `list`コマンドはユーザーの基本情報（ID、名前、メール、学年、ロール、作成日時）を表示します

**ローカルデータベースのセットアップ:**
初回ローカル実行時は、以下の手順でデータベースをセットアップしてください：

1. **データベースのリセット**（推奨）:
   ```bash
   npm run seed -- user reset --local
   ```

2. **テストユーザーの追加**:
   ```bash
   npm run seed -- user add --email="test@example.com" --grade=2 --local
   ```

**手動セットアップ（上記が失敗する場合）:**
```bash
cd apps/worker
wrangler d1 execute mlm-dx-db --file=./schema.sql --local
cd ../..
```

**トラブルシューティング:**
- `Couldn't find a D1 DB with the name or binding`エラーが発生した場合、`npm run seed -- user reset --local`を実行してください
- ローカルデータベースは`.wrangler/state/v3/d1/`ディレクトリに保存されます
- ローカルデータベースを完全にリセットしたい場合は、`.wrangler`ディレクトリを削除してください
- `user reset`コマンドでデータベースの構造を再作成できます
- `reservation reset`や`groups reset`で特定のテーブルのデータのみを削除できます
- `list`コマンドでユーザー一覧を確認できます

## 機能

- ユーザー認証（Google OAuth 2.0 + JWT）
- バンド管理
- メンバー管理
- 予約管理
- アーカイブ管理

## 認証システム

### Workers側のみで実行するJWT認証ワークフロー

認証は**Cloudflare Workers(Hono)** 側で完結します。OAuth認可コードは**PKCE**で保護し、トークン交換後の**IDトークンはGoogleのJWKS**で署名と`iss/aud/exp/nonce`を検証します。プロフィールの`email_verified`も確認し、D1の`users`ホワイトリストに合致したユーザーのみ許可します。許可時はWorkersが**JWT**を生成し、HttpOnly+Secure Cookieで返却します。

#### 認証フロー詳細

1. ユーザーがフロントエンドの「Googleでログイン」ボタンをクリック
2. フロントエンドがWorkersの`POST /auth/signin/google`を呼び出し
3. Workersが`state/nonce/code_verifier`を生成してCookie保存し、`code_challenge(S256)`付きのGoogle認可URLを返却
4. Googleが認可後にWorkersの`GET /auth/callback/google`へ`code/state`で戻す
5. Workersが`state`・`code_verifier`・`redirect_uri`でトークン交換し、IDトークンをJWKSで検証（`iss/aud/exp/nonce`）
6. アクセストークンで`userinfo`を取得し、`email_verified`とD1のホワイトリストを検証
7. 許可時にWorkersがJWTを生成（`sub`にDBユーザーID）し、HttpOnly+Secure Cookie（1週間）で返却
8. フロントエンドにリダイレクト後、`GET /auth/session`でセッション取得

### 認証フロー図

```mermaid
sequenceDiagram
    participant U as ユーザー
    participant F as Next.jsフロントエンド<br/>(kumatoratiger.com)
    participant W as Cloudflare Workers<br/>(Honoアプリ)
    participant G as Google OAuth
    participant D as D1 usersテーブル<br/>(ホワイトリスト)

    Note over U,D: 1. ユーザのGoogleログイン要求
    U->>F: 「Googleでログイン」ボタンクリック
    F->>W: POST /auth/signin/google
    W->>W: state/nonce/code_verifier 生成<br/>(Cookie保存)
    W-->>G: 302 リダイレクト /authorize<br/>(client_id + state + code_challenge + nonce)

    Note over U,D: 2. Googleによる認可 & コールバック
    U->>G: Googleログイン画面で認証/同意
    G-->>W: GET /auth/callback/google?code&state
    W->>W: state/nonce 検証
    W->>G: POST /token(code + code_verifier + redirect_uri)
    G-->>W: access_token + id_token
    W->>W: JWKSでid_token検証(iss/aud/exp/nonce)

    Note over U,D: 3. ユーザ情報の取得とJWT発行
    W->>G: GET /userinfo (アクセストークン使用)
    G-->>W: ユーザプロフィール(email, name等)
    W->>D: ホワイトリスト照合(email)
    alt 許可されたユーザ
        W->>W: JWT生成<br/>(email, exp, 署名)
        W-->>F: HttpOnly + Secure Cookie<br/>(JWT設定)
        F-->>U: ログイン完了
    else 非許可ユーザ
        W-->>F: 403 Forbidden
        F-->>U: アクセス拒否エラー
    end

    Note over U,D: 4. APIリクエスト時のJWT検証
    U->>F: 認証付きAPI呼び出し
    F->>W: APIリクエスト<br/>(Cookie: JWT)
    W->>W: JWT署名・有効期限検証
    alt JWT有効
        W->>D: ユーザ許可チェック
        alt 許可
            W-->>F: 200 データ返却
            F-->>U: レスポンス表示
        else 非許可
            W-->>F: 403 Forbidden
        end
    else JWT無効
        W-->>F: 401 Unauthorized
    end

    Note over U,D: 5. ログアウト
    U->>F: ログアウトボタンクリック
    F->>F: Cookie削除 (JWT破棄)
    F-->>U: ログアウト完了
```

### APIアクセス制御フロー図

```mermaid
sequenceDiagram
    participant F as フロントエンド
    participant A as Hono APIルート
    participant M as 認証ミドルウェア
    participant D as Allowlist/RBAC

    F->>A: fetch /users/holder (Cookie または Bearer)
    A->>M: セッション/JWT検証
    M->>D: ユーザー識別子で権限チェック
    alt 許可
        M-->>A: user(id,email,roles) を添付
        A-->>F: 200 データ返却
    else 拒否
        M-->>F: 401/403
    end
```

### ホワイトリスト運用

**重要**: `users`テーブルは事前登録専用です。新しいユーザーを追加するには、管理者が手動でデータベースにレコードを挿入する必要があります。

#### 新しいユーザーの追加方法

```sql
-- 新しいユーザーを追加
INSERT INTO users (
  id, name, nickname, email, instruments, grade, role, 
  created_at, updated_at
) VALUES (
  'user-uuid-here',           -- 一意のUUID
  NULL,                       -- 名前（Google OAuth認証時に自動設定）
  NULL,                       -- ニックネーム
  'tanaka@example.com',       -- Googleアカウントのメールアドレス
  '[]',                       -- 楽器（空配列）
  3,                          -- 学年
  'MBR',                      -- ロール（MBR: 部員）
  datetime('now'),            -- 作成日時
  datetime('now')             -- 更新日時
);
```

#### ロール一覧

| ロール | 説明 |
|--------|------|
| `ADM` | 管理者 |
| `MGR` | 部長 |
| `CHF` | 主務 |
| `MAC` | 医会計 |
| `MBR` | 部員 |
| `NHD` | 看護部長 |
| `NAC` | 看護会計 |

#### 楽器一覧

| 楽器 | 説明 |
|------|------|
| `VO` | ボーカル |
| `GT` | ギター |
| `KEY` | キーボード |
| `DR` | ドラム |
| `BA` | ベース |

### セキュリティ設定

- **PKCE**: 認可コード窃取対策（`code_verifier/code_challenge(S256)`）
- **IDトークン検証**: Google JWKSで署名と`iss/aud/exp/nonce`を検証
- **メール検証**: `email_verified` が false のユーザーは拒否
- **ホワイトリスト**: `users`テーブルに登録されたメールのみ許可
- **JWT**: HMAC-SHA256署名・有効期限1週間
- **Cookie**: HttpOnly + SameSite=Lax + 環境に応じてSecure

## 主なAPIエンドポイント

### 認証
- `POST /auth/signin/google` - Googleログイン開始（PKCE/nonce生成）
- `GET /auth/callback/google` - Googleコールバック（state/code_verifier検証 + JWKS検証）
- `GET /auth/session` - セッション情報取得（JWT検証）
- `POST /auth/signout` - ログアウト（Cookie削除）

### ユーザー管理
- `GET /users/fetch/:email` - ユーザー情報取得
- `PUT /users/update` - ユーザー情報更新
- `GET /users/groups` - ユーザーのグループ一覧
- `GET /users/holder` - 予約ホルダー情報

### グループ管理
- `GET /groups` - グループ一覧
- `POST /groups/upsert` - グループ作成/更新
- `GET /groups/:id` - グループ詳細
- `PUT /groups/:id` - グループ更新
- `DELETE /groups/:id` - グループ削除

### メンバー管理
- `GET /members/fetch` - メンバー一覧
- `GET /members/list` - メンバーリスト
- `GET /members/nickname/:id` - ニックネーム取得
- `GET /members/group/:groupId` - グループメンバー
- `POST /members/group/:groupId` - メンバー追加
- `DELETE /members/group/:groupId/:userId` - メンバー削除

### 予約管理
- `GET /reservations/fetch` - 予約一覧
- `GET /reservations/user` - ユーザー予約
- `GET /reservations/group/:groupId` - グループ予約
- `POST /reservations/create` - 予約作成
- `PUT /reservations/cancel/:id` - 予約キャンセル

### アーカイブ管理
- `GET /archive/group/:groupId` - アーカイブ一覧
- `POST /archive/group/:groupId` - アーカイブ追加
- `PUT /archive/:id` - アーカイブ更新
- `DELETE /archive/:id` - アーカイブ削除

### YouTubeアーカイブ
- `GET /archive/youtube/playlists` - 自アカウントの限定公開プレイリスト一覧を返す

## トラブルシューティング

### リダイレクトURIのエラー
- Google Cloud Consoleで設定したリダイレクトURIが正確であることを確認
- プロトコル（http/https）とポート番号も含めて完全一致する必要があります

### JavaScript生成元のエラー
- 「承認済みのJavaScript生成元」が空の場合、`Error 400: redirect_uri_mismatch`が発生します
- 開発環境では`http://localhost:3000`と`http://127.0.0.1:3000`を設定
- 本番環境では`https://your-frontend-domain.com`を設定
- ワイルドカード（`*`）は使用できません

### AUTH_SECRETのエラー
- 32文字以上のランダムな文字列であることを確認
- 特殊文字が含まれている場合は、TOMLファイルで引用符で囲む

### CORSエラー
- `CORS_ORIGIN`がフロントエンドのURLと一致していることを確認
- カンマ区切りで複数のオリジンを指定可能: `"http://localhost:3000,https://example.com"`

### データベースエラー
- マイグレーションが正しく実行されていることを確認
- `users`テーブルに事前にユーザーを登録する必要があります

### セッションクッキーの問題

- **開発環境でセッションが保持されない**: `NODE_ENV=development`が設定されていることを確認
- **本番環境でセッションが保持されない**: `NODE_ENV=production`が設定され、HTTPS環境であることを確認
- **クロスオリジンでセッションが送信されない**: `__Host-`プレフィックスが削除されていることを確認

### 認証フローのテスト
1. ブラウザで `http://localhost:8787/auth/signin/google` にアクセス
2. Googleアカウントでログイン
3. 認証が成功すると、フロントエンドにリダイレクトされます

### セッション情報の確認
```bash
curl http://localhost:8787/auth/session
```

## npmスクリプト一覧

### 開発環境（ローカル）

| スクリプト | 説明 |
|-----------|------|
| `npm run dev` | フルスタック開発環境を起動（ローカル） |
| `npm run dev:local` | フルスタック開発環境を起動（ローカル） |
| `npm run dev:web` | フロントエンドのみ起動 |
| `npm run dev:worker:local` | バックエンドのみ起動（ローカル） |
| `npm run build:local` | ローカル用ビルド |
| `npm run db:setup:local` | ローカルDB設定 |

### 本番環境（クラウド）

| スクリプト | 説明 |
|-----------|------|
| `npm run deploy:all:prod` | 本番環境にフルスタックデプロイ |
| `npm run deploy:worker:prod` | 本番環境にWorkerデプロイ |
| `npm run deploy:web:prod` | 本番環境にWebデプロイ |
| `npm run db:setup:prod` | 本番DB設定 |

### ユーティリティ

| スクリプト | 説明 |
|-----------|------|
| `npm run lint` | 全プロジェクトのリント |
| `npm run lint:web` | フロントエンドのリント |
| `npm run lint:worker` | バックエンドのリント |
| `npm run type-check` | 型チェック |
| `npm run clean` | 全ビルド成果物を削除 |
| `npm run clean:local` | ローカルビルド成果物を削除 |
| `npm run install:all` | 全依存関係をインストール |