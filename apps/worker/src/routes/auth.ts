import { Hono } from 'hono';
import type { Context } from 'hono';

const authRoutes = new Hono();

authRoutes.get('/signin', async (c: Context) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="ja">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>ログイン - MLM-DX</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          margin: 0;
          padding: 0;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .container {
          background: white;
          border-radius: 12px;
          box-shadow: 0 20px 40px rgba(0,0,0,0.1);
          padding: 2rem;
          text-align: center;
          max-width: 400px;
          width: 90%;
        }
        .logo {
          font-size: 2rem;
          font-weight: bold;
          color: #333;
          margin-bottom: 1rem;
        }
        .description {
          color: #666;
          margin-bottom: 2rem;
          line-height: 1.5;
        }
        .google-btn {
          background: #4285f4;
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 8px;
          font-size: 16px;
          cursor: pointer;
          text-decoration: none;
          display: inline-block;
          transition: background 0.3s;
        }
        .google-btn:hover {
          background: #3367d6;
        }
        .error {
          background: #fee;
          color: #c33;
          padding: 1rem;
          border-radius: 8px;
          margin-bottom: 1rem;
          border: 1px solid #fcc;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="logo">MLM-DX</div>
        <div class="description">
          バンド管理システムにログインして、<br>
          楽しい音楽活動を始めましょう
        </div>
        ${c.req.query('error') ? `
          <div class="error">
            ログインに失敗しました。アクセス権限がない可能性があります。
          </div>
        ` : ''}
        <a href="/auth/signin/google" class="google-btn">
          Googleでログイン
        </a>
      </div>
    </body>
    </html>
  `);
});

authRoutes.get('/error', async (c: Context) => {
  const error = c.req.query('error') || 'Unknown error';
  return c.html(`
    <!DOCTYPE html>
    <html lang="ja">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>エラー - MLM-DX</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
          margin: 0;
          padding: 0;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .container {
          background: white;
          border-radius: 12px;
          box-shadow: 0 20px 40px rgba(0,0,0,0.1);
          padding: 2rem;
          text-align: center;
          max-width: 400px;
          width: 90%;
        }
        .error-icon {
          font-size: 3rem;
          color: #ff6b6b;
          margin-bottom: 1rem;
        }
        .error-title {
          font-size: 1.5rem;
          font-weight: bold;
          color: #333;
          margin-bottom: 1rem;
        }
        .error-message {
          color: #666;
          margin-bottom: 2rem;
          line-height: 1.5;
        }
        .back-btn {
          background: #667eea;
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 8px;
          font-size: 16px;
          cursor: pointer;
          text-decoration: none;
          display: inline-block;
          transition: background 0.3s;
        }
        .back-btn:hover {
          background: #5a6fd8;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="error-icon">⚠️</div>
        <div class="error-title">ログインエラー</div>
        <div class="error-message">
          ${error === 'AccessDenied' ? 
            'アクセスが拒否されました。許可されたメールアドレスでログインしてください。' :
            'ログイン中にエラーが発生しました。もう一度お試しください。'
          }
        </div>
        <a href="/auth/signin" class="back-btn">
          ログインページに戻る
        </a>
      </div>
    </body>
    </html>
  `);
});

export { authRoutes };
