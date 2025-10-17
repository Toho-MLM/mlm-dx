-- MLM-DX Database Schema
-- Unified schema for Cloudflare D1 (SQLite)

-- Users table (updated to match Supabase schema)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  student_number TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  nickname TEXT,
  email TEXT UNIQUE NOT NULL,
  instruments TEXT NOT NULL DEFAULT '[]', -- JSON array of instruments
  grade TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'MBR',
  image TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Groups table (renamed from bands)
CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  assignments TEXT, -- JSON object
  is_main BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Group members table (renamed from members)
CREATE TABLE IF NOT EXISTS group_members (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  joined_at TEXT NOT NULL,
  FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(group_id, user_id)
);

-- Reservations table (updated to match Supabase schema)
CREATE TABLE IF NOT EXISTS reservations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  creator TEXT NOT NULL,
  group_id TEXT,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  notes TEXT,
  state TEXT NOT NULL DEFAULT 'PENDING',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (creator) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (group_id) REFERENCES groups(id)
);

-- Archive table
CREATE TABLE IF NOT EXISTS archive (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  youtube_url TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_student_number ON users(student_number);
CREATE INDEX IF NOT EXISTS idx_group_members_group_id ON group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user_id ON group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_reservations_group_id ON reservations(group_id);
CREATE INDEX IF NOT EXISTS idx_reservations_start_time ON reservations(start_time);
CREATE INDEX IF NOT EXISTS idx_reservations_creator ON reservations(creator);
CREATE INDEX IF NOT EXISTS idx_archive_group_id ON archive(group_id);

-- Sample data for development/testing
INSERT OR IGNORE INTO users (id, student_number, name, nickname, email, instruments, grade, role, image, created_at, updated_at) VALUES 
('550e8400-e29b-41d4-a716-446655440000', '12345678', 'Admin User', 'Admin', 'admin@example.com', '["Guitar", "Bass"]', '4', 'ADMIN', '', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'),
('550e8400-e29b-41d4-a716-446655440001', '87654321', 'Test User', 'Test', 'user@example.com', '["Drums", "Piano"]', '2', 'MBR', '', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z');

INSERT OR IGNORE INTO groups (id, name, assignments, is_main, is_active, created_at, updated_at) VALUES 
('650e8400-e29b-41d4-a716-446655440000', 'Sample Group', '{"Guitar": "550e8400-e29b-41d4-a716-446655440000", "Drums": "550e8400-e29b-41d4-a716-446655440001"}', FALSE, TRUE, '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z');

INSERT OR IGNORE INTO group_members (id, group_id, user_id, role, joined_at) VALUES 
('750e8400-e29b-41d4-a716-446655440000', '650e8400-e29b-41d4-a716-446655440000', '550e8400-e29b-41d4-a716-446655440000', 'leader', '2024-01-01T00:00:00Z'),
('750e8400-e29b-41d4-a716-446655440001', '650e8400-e29b-41d4-a716-446655440000', '550e8400-e29b-41d4-a716-446655440001', 'member', '2024-01-01T00:00:00Z');
