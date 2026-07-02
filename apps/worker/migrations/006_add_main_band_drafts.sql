CREATE TABLE IF NOT EXISTS main_band_drafts (
  id TEXT PRIMARY KEY,
  share_token TEXT NOT NULL UNIQUE,
  state_json TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);
