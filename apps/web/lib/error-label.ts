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
