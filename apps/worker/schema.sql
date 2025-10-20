-- MLM-DX Database Schema
-- Unified schema for Cloudflare D1 (SQLite)

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  student_number TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  nickname TEXT,
  email TEXT UNIQUE NOT NULL,
  instruments TEXT NOT NULL DEFAULT '[]', -- JSON array of instrument codes: ["VO","GT","KEY","DR","BA"]
  grade INTEGER NOT NULL,
  role TEXT NOT NULL DEFAULT 'MBR' CHECK (role IN ('MGR','CHF','MACT','MBR','ADM','NHD','NACT')),
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

CREATE TABLE IF NOT EXISTS google_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  google_id TEXT NOT NULL,
  refresh_token TEXT,
  access_token TEXT,
  expires_at INTEGER,
  token_type TEXT,
  scope TEXT,
  id_token TEXT,
  session_state TEXT,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  session_token TEXT UNIQUE NOT NULL,
  user_id TEXT NOT NULL,
  expires DATETIME NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS verification_tokens (
  identifier TEXT NOT NULL,
  token TEXT NOT NULL,
  expires DATETIME NOT NULL,
  PRIMARY KEY (identifier, token)
);



-- Sample data for development/testing
INSERT OR IGNORE INTO users (id, student_number, name, nickname, email, instruments, grade, role, created_at, updated_at) VALUES 
('550e8400-e29b-41d4-a716-446655440000', '12345678', 'Admin User', 'Admin', 'admin@example.com', '["GT", "BA"]', 4, 'ADM', '2024-01-01 00:00:00', '2024-01-01 00:00:00'),
('550e8400-e29b-41d4-a716-446655440001', '87654321', 'Test User', 'Test', 'user@example.com', '["DR", "KEY"]', 2, 'MBR', '2024-01-01 00:00:00', '2024-01-01 00:00:00');

INSERT OR IGNORE INTO groups (id, name, is_main, is_active, created_at, updated_at) VALUES 
('650e8400-e29b-41d4-a716-446655440000', 'Sample Group', FALSE, TRUE, '2024-01-01 00:00:00', '2024-01-01 00:00:00');

INSERT OR IGNORE INTO group_member_instruments (id, group_id, user_id, instrument, created_at, updated_at) VALUES 
('850e8400-e29b-41d4-a716-446655440000', '650e8400-e29b-41d4-a716-446655440000', '550e8400-e29b-41d4-a716-446655440000', 'GT', '2024-01-01 00:00:00', '2024-01-01 00:00:00'),
('850e8400-e29b-41d4-a716-446655440001', '650e8400-e29b-41d4-a716-446655440000', '550e8400-e29b-41d4-a716-446655440001', 'DR', '2024-01-01 00:00:00', '2024-01-01 00:00:00');
