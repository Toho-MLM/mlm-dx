// groups テーブルを g として結合した一覧で使う、本バンド優先の並び順。
export const MAIN_BAND_ORDER_SQL = 'g.main_index IS NULL, g.main_index ASC';

// 自由バンドはバンドの作成日時が古い順。同時刻ならIDで順番を固定する。
export const BAND_DISPLAY_ORDER_SQL = `${MAIN_BAND_ORDER_SQL}, g.created_at ASC, g.id ASC`;
