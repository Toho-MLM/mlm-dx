-- MLM-DX Database Schema
-- Unified schema for Cloudflare D1 (SQLite)

-- Drop existing tables (for reset functionality)
DROP TABLE IF EXISTS reservation_limits;
DROP TABLE IF EXISTS unavailable_periods;
DROP TABLE IF EXISTS external_reservations;
DROP TABLE IF EXISTS external_studios;
DROP TABLE IF EXISTS main_band_drafts;
DROP TABLE IF EXISTS archives;
DROP TABLE IF EXISTS setlist_items;
DROP TABLE IF EXISTS entries;
DROP TABLE IF EXISTS events;
DROP TABLE IF EXISTS reservations;
DROP TABLE IF EXISTS group_member_instruments;
DROP TABLE IF EXISTS groups;
DROP TABLE IF EXISTS passkey_challenges;
DROP TABLE IF EXISTS passkeys;
DROP TABLE IF EXISTS users;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  nickname TEXT,
  email TEXT UNIQUE NOT NULL,
  avatar TEXT,
  instruments TEXT NOT NULL DEFAULT '[]', -- JSON array of instrument codes: ["VO","GT","KEY","DR","BA"]
  grade INTEGER NOT NULL,
  role TEXT NOT NULL DEFAULT 'MBR' CHECK (role IN ('MGR','CHF','MAC','MBR','ADM','NHD','NAC')),
  email_notification_preference_code INTEGER NOT NULL DEFAULT 510510 CHECK (email_notification_preference_code >= 1),
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS passkeys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  credential_id TEXT NOT NULL UNIQUE,
  public_key TEXT NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  device_type TEXT,
  backed_up BOOLEAN,
  transports TEXT,
  attestation_format TEXT,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS passkey_challenges (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  email TEXT,
  challenge TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('register','login')),
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  is_main BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS group_member_instruments (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  instrument TEXT NOT NULL CHECK (instrument IN ('VO','GT','KEY','DR','BA')),
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(group_id, user_id, instrument)
);

CREATE TABLE IF NOT EXISTS main_band_drafts (
  id TEXT PRIMARY KEY,
  share_token TEXT NOT NULL UNIQUE,
  state_json TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reservations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  group_id TEXT,
  start_time DATETIME NOT NULL,
  end_time DATETIME NOT NULL,
  state TEXT NOT NULL DEFAULT 'PENDING' CHECK (state IN ('PENDING','WITHDRAWN','DECLINED','CONFIRMED','CANCELLED','COMPLETED')),
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS external_studios (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  start_datetime DATETIME NOT NULL,
  end_datetime DATETIME NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  CHECK (end_datetime > start_datetime)
);

CREATE TABLE IF NOT EXISTS external_reservations (
  id TEXT PRIMARY KEY,
  external_studio_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  group_id TEXT NOT NULL,
  start_time DATETIME NOT NULL,
  end_time DATETIME NOT NULL,
  state TEXT NOT NULL DEFAULT 'PENDING' CHECK (state IN ('PENDING','WITHDRAWN','DECLINED','CONFIRMED','CANCELLED','COMPLETED')),
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  FOREIGN KEY (external_studio_id) REFERENCES external_studios(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reservation_limits (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL CHECK (scope IN ('PERSONAL','GROUP')),
  limit_type TEXT NOT NULL DEFAULT 'FIXED' CHECK (limit_type IN ('FIXED','ROLLING')),
  start_datetime DATETIME,
  end_datetime DATETIME,
  window_days INTEGER CHECK (window_days IS NULL OR window_days > 0),
  max_minutes INTEGER NOT NULL CHECK (max_minutes > 0),
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  CHECK (
    (limit_type = 'FIXED' AND start_datetime IS NOT NULL AND end_datetime IS NOT NULL AND end_datetime > start_datetime AND window_days IS NULL)
    OR
    (limit_type = 'ROLLING' AND start_datetime IS NULL AND end_datetime IS NULL AND window_days IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS archives (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  youtube_url TEXT NOT NULL,
  year INTEGER NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  event_date DATETIME NOT NULL,
  entry_deadline DATETIME NOT NULL,
  is_entry_accepting BOOLEAN NOT NULL DEFAULT TRUE,
  setlist_deadline DATETIME NOT NULL,
  is_setlist_accepting BOOLEAN NOT NULL DEFAULT TRUE,
  group_limit INTEGER NOT NULL DEFAULT 2,
  song_limit INTEGER NOT NULL DEFAULT 2,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS entries (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  group_id TEXT NOT NULL,
  note TEXT,
  position INTEGER,
  start_time DATETIME,
  end_time DATETIME,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
  UNIQUE(event_id, group_id)
);

CREATE TABLE IF NOT EXISTS setlist_items (
  id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS unavailable_periods (
  id TEXT PRIMARY KEY,
  start_datetime DATETIME NOT NULL,
  end_datetime DATETIME NOT NULL,
  reason TEXT,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  CHECK (end_datetime > start_datetime)
);
