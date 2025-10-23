-- MLM-DX Database Schema
-- Unified schema for Cloudflare D1 (SQLite)

-- Drop existing tables (for reset functionality)
DROP TABLE IF EXISTS archive;
DROP TABLE IF EXISTS reservations;
DROP TABLE IF EXISTS group_member_instruments;
DROP TABLE IF EXISTS groups;
DROP TABLE IF EXISTS users;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT,
  nickname TEXT,
  email TEXT UNIQUE NOT NULL,
  instruments TEXT NOT NULL DEFAULT '[]', -- JSON array of instrument codes: ["VO","GT","KEY","DR","BA"]
  grade INTEGER NOT NULL,
  role TEXT NOT NULL DEFAULT 'MBR' CHECK (role IN ('MGR','CHF','MAC','MBR','ADM','NHD','NAC')),
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
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

CREATE TABLE IF NOT EXISTS reservations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booked_by TEXT NOT NULL,
  holder_user_id TEXT,
  holder_group_id TEXT,
  start_time DATETIME NOT NULL,
  end_time DATETIME NOT NULL,
  state TEXT NOT NULL DEFAULT 'PENDING' CHECK (state IN ('PENDING','WITHDRAWN','DECLINED','CONFIRMED','CANCELLED','COMPLETED')),
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  CHECK ((holder_user_id IS NOT NULL AND holder_group_id IS NULL) OR (holder_user_id IS NULL AND holder_group_id IS NOT NULL)),
  FOREIGN KEY (booked_by) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (holder_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (holder_group_id) REFERENCES groups(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS archive (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  youtube_url TEXT,
  year INTEGER NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
);

