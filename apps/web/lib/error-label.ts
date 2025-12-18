export const ERROR_MESSAGES: Record<string, string> = {
  // 予約関連エラー
  'INVALID_RESERVATION_TIME': '予約時間が無効です。',
  'GROUP_NOT_FOUND': '指定されたグループが見つからないか、無効です。',
  'NOT_GROUP_MEMBER': '指定されたグループのメンバーではありません。',
  'RESERVATION_CONFLICT': 'この時間帯は既に予約されています。',
  'INVALID_USER_OR_GROUP': '無効なユーザーまたはグループが指定されています。',
  'RESERVATION_NOT_FOUND': '予約が見つかりません。',
  'RESERVATION_CANNOT_BE_CANCELLED': 'この予約はキャンセルできません。',
  
  // 認証関連エラー
  'NO_AUTHENTICATION_TOKEN': '認証トークンが見つかりません。',
  'INVALID_TOKEN': '無効なトークンです。',
  'USER_NOT_FOUND': 'ユーザーが見つかりません。',
  'AUTHENTICATION_FAILED': '認証に失敗しました。',
  'SIGNOUT_FAILED': 'ログアウトに失敗しました。',
  
  // グループ・メンバー関連エラー
  'INVALID_PARAMETERS': '無効なパラメータです。',
  'EMAIL_ALREADY_EXISTS': 'このメールアドレスは既に登録されています。',
  'USERS_ALREADY_EXIST': '既にユーザーが存在します。',
  'MEMBER_NOT_FOUND': 'メンバーが見つかりません。',
  'NO_VALID_GROUPS': '有効なグループがありません。',
  
  // イベント・エントリー関連エラー
  'INVALID_DATE_ORDER': 'イベントの日付が不正な順序です。',
  'ENTRY_NOT_FOUND': 'エントリーが見つかりません。',
  'ENTRY_NOT_ACCEPTING': '参加登録の受け付けは終了しています。',
  'ENTRY_DEADLINE_PASSED': '参加登録の締切が過ぎています。',
  'SETLIST_ITEM_NOT_FOUND': 'セットリストアイテムが見つかりません。',
  'GROUP_LIMIT_EXCEEDED': 'メンバーのバンド登録数が上限を超えています。',
  'EVENT_NOT_FOUND': 'イベントが見つかりません。',
  
  // 権限関連エラー
  'INSUFFICIENT_PERMISSIONS': 'この操作を実行する権限がありません。',
  
  // 入力バリデーションエラー
  'INVALID_INPUT': '入力が無効です。',
  'INVALID_REQUEST_DATA': 'リクエストデータが無効です。',
  
  // アーカイブ関連エラー
  'TITLE_REQUIRED': 'タイトルは必須です。',
  'ARCHIVE_NOT_FOUND': 'アーカイブが見つかりません。',
  
  // 一般的なエラー
  'INTERNAL_SERVER_ERROR': 'サーバー内部エラーが発生しました。',
  'NETWORK_ERROR': 'ネットワークエラーが発生しました。',
  'REQUEST_TIMEOUT': 'リクエストがタイムアウトしました。',
  'UNKNOWN_ERROR': '不明なエラーが発生しました。',
}

export function translateError(error: string): string {
  return ERROR_MESSAGES[error] || error
}
