CREATE TABLE main_band_drafts_new (
  id TEXT PRIMARY KEY,
  share_token TEXT NOT NULL UNIQUE,
  state_json TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

INSERT INTO main_band_drafts_new (id, share_token, state_json, created_by, created_at, updated_at)
SELECT id, share_token, state_json, created_by, created_at, updated_at
FROM main_band_drafts;

DROP TABLE main_band_drafts;

ALTER TABLE main_band_drafts_new RENAME TO main_band_drafts;
