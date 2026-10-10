-- 次回の幹部交代を一括で予約する。既存の役職・部員データは変更しない。
CREATE TABLE IF NOT EXISTS executive_transitions (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  revision TEXT NOT NULL,
  effective_date TEXT NOT NULL,
  effective_at TEXT NOT NULL,
  assignments TEXT NOT NULL CHECK (json_valid(assignments) AND json_type(assignments) = 'array'),
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'APPLIED', 'CANCELLED', 'FAILED')),
  failure_reason TEXT CHECK (failure_reason IS NULL OR failure_reason = 'MEMBER_UNAVAILABLE'),
  updated_at TEXT NOT NULL
);
