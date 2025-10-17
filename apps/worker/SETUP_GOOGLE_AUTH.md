# Google OAuth 設定ガイド

## 1. Google Cloud Console でプロジェクトを作成

1. [Google Cloud Console](https://console.cloud.google.com/)にアクセス
2. 新しいプロジェクトを作成するか、既存のプロジェクトを選択

## 2. OAuth 2.0 認証情報を設定

### 2.1 OAuth同意画面の設定

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

### 2.2 OAuth 2.0 クライアントIDの作成

1. 「認証情報」タブを選択
2. 「認証情報を作成」→「OAuth 2.0 クライアントID」を選択
3. アプリケーションの種類: `ウェブアプリケーション`
4. 名前: `MLM-DX Worker`
5. 承認済みのリダイレクトURIを追加:

#### 開発環境
```
http://localhost:8787/api/auth/callback/google
```

#### 本番環境
```
https://mlm-dx-worker.your-account.workers.dev/api/auth/callback/google
```

6. 「作成」をクリック
7. クライアントIDとクライアントシークレットをコピー

## 3. wrangler.toml に環境変数を設定

### 3.1 AUTH_SECRETの生成

ターミナルで以下のコマンドを実行:
```bash
openssl rand -base64 32
```

### 3.2 wrangler.tomlファイルに追加

```toml
[env.development.vars]
AUTH_SECRET = "生成した32文字以上の文字列"
CORS_ORIGIN = "http://localhost:3000"
GOOGLE_CLIENT_ID = "取得したクライアントID"
GOOGLE_CLIENT_SECRET = "取得したクライアントシークレット"

[env.production.vars]
AUTH_SECRET = "本番用の32文字以上の文字列"
CORS_ORIGIN = "https://your-production-domain.com"
GOOGLE_CLIENT_ID = "本番用クライアントID"
GOOGLE_CLIENT_SECRET = "本番用クライアントシークレット"
```

## 4. データベースのセットアップ

```bash
# ローカル開発用
npm run db:setup:local

# 開発環境用
npm run db:setup:dev

# 本番環境用
npm run db:setup
```

## 5. 開発サーバーの起動

```bash
npm run dev
```

## 6. 認証フローのテスト

1. ブラウザで `http://localhost:8787/api/auth/signin` にアクセス
2. Googleアカウントでログイン
3. 認証が成功すると、フロントエンドにリダイレクトされます

## 7. セッション情報の確認

```bash
curl http://localhost:8787/api/auth/session
```

## トラブルシューティング

### リダイレクトURIのエラー
- Google Cloud Consoleで設定したリダイレクトURIが正確であることを確認
- プロトコル（http/https）とポート番号も含めて完全一致する必要があります

### AUTH_SECRETのエラー
- 32文字以上のランダムな文字列であることを確認
- 特殊文字が含まれている場合は、TOMLファイルで引用符で囲む

### CORSエラー
- `CORS_ORIGIN`がフロントエンドのURLと一致していることを確認
- カンマ区切りで複数のオリジンを指定可能: `"http://localhost:3000,https://example.com"`

### データベースエラー
- マイグレーションが正しく実行されていることを確認
- `google_id`カラムがusersテーブルに存在することを確認

