CREATE TABLE IF NOT EXISTS reservation_scope_locks (
  scope_key TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
