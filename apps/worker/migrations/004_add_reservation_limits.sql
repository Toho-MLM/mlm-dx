CREATE TABLE IF NOT EXISTS reservation_limits (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL CHECK (scope IN ('PERSONAL','GROUP')),
  start_datetime DATETIME NOT NULL,
  end_datetime DATETIME NOT NULL,
  max_minutes INTEGER NOT NULL CHECK (max_minutes > 0),
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  CHECK (end_datetime > start_datetime)
);
