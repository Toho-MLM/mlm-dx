-- MLM-DX Database Schema
-- Unified schema for Cloudflare D1 (SQLite)

-- Drop existing tables (for reset functionality)
DROP TABLE IF EXISTS reservation_limits;
DROP TABLE IF EXISTS unavailable_periods;
DROP TABLE IF EXISTS external_reservation_usage;
DROP TABLE IF EXISTS external_lottery_limit_holds;
DROP TABLE IF EXISTS external_lottery_applications;
DROP TABLE IF EXISTS external_reservations;
DROP TABLE IF EXISTS external_studios;
DROP TABLE IF EXISTS main_band_drafts;
DROP TABLE IF EXISTS archives;
DROP TABLE IF EXISTS setlist_items;
DROP TABLE IF EXISTS entries;
DROP TABLE IF EXISTS events;
DROP TABLE IF EXISTS reservations;
DROP TABLE IF EXISTS hall_lottery_preferences;
DROP TABLE IF EXISTS hall_lottery_commits;
DROP TABLE IF EXISTS hall_lottery_applications;
DROP TABLE IF EXISTS hall_lotteries;
DROP TABLE IF EXISTS group_member_instruments;
DROP TABLE IF EXISTS groups;
DROP TABLE IF EXISTS passkey_challenges;
DROP TABLE IF EXISTS passkeys;
DROP TABLE IF EXISTS auth_sessions;
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

CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE CHECK (length(token_hash) = 43),
  user_id TEXT NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at ON auth_sessions(expires_at);

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
  main_index INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_groups_main_index
  ON groups(main_index) WHERE main_index IS NOT NULL;

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
  target_type TEXT NOT NULL DEFAULT 'EXTERNAL' CHECK (target_type IN ('HALL','EXTERNAL')),
  start_datetime DATETIME NOT NULL,
  end_datetime DATETIME NOT NULL,
  draw_datetime DATETIME,
  room_names TEXT NOT NULL CHECK (json_valid(room_names) AND json_type(room_names) = 'array' AND json_array_length(room_names) > 0),
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  CHECK (end_datetime > start_datetime),
  CHECK (
    (target_type = 'HALL' AND draw_datetime IS NOT NULL AND draw_datetime < start_datetime)
    OR (target_type = 'EXTERNAL' AND draw_datetime IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS external_reservations (
  id TEXT PRIMARY KEY,
  external_studio_id TEXT NOT NULL,
  room_number INTEGER NOT NULL CHECK (room_number >= 1),
  user_id TEXT NOT NULL,
  group_id TEXT,
  start_time DATETIME NOT NULL,
  end_time DATETIME NOT NULL,
  state TEXT NOT NULL DEFAULT 'PENDING' CHECK (state IN ('PENDING','WITHDRAWN','DECLINED','CONFIRMED','CANCELLED','COMPLETED')),
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  FOREIGN KEY (external_studio_id) REFERENCES external_studios(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_external_reservations_room_time
  ON external_reservations(external_studio_id, room_number, state, start_time, end_time);

CREATE INDEX IF NOT EXISTS idx_external_studios_target_time
  ON external_studios(target_type, start_datetime, end_datetime);

CREATE INDEX IF NOT EXISTS idx_external_studios_due_hall_lottery
  ON external_studios(target_type, draw_datetime);

CREATE TABLE IF NOT EXISTS external_lottery_applications (
  id TEXT PRIMARY KEY,
  external_studio_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  group_id TEXT,
  preferred_start_datetime DATETIME,
  preferred_end_datetime DATETIME,
  requested_duration_minutes INTEGER,
  state TEXT NOT NULL DEFAULT 'PENDING' CHECK (state IN ('PENDING','WON','LOST','CANCELLED')),
  fairness_score REAL,
  assigned_room_number INTEGER,
  assigned_start_datetime DATETIME,
  assigned_end_datetime DATETIME,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  FOREIGN KEY (external_studio_id) REFERENCES external_studios(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
  CHECK ((preferred_start_datetime IS NULL) = (preferred_end_datetime IS NULL)),
  CHECK (preferred_start_datetime IS NOT NULL OR requested_duration_minutes IS NOT NULL),
  CHECK (preferred_start_datetime IS NULL OR preferred_end_datetime > preferred_start_datetime),
  CHECK (requested_duration_minutes IS NULL OR requested_duration_minutes BETWEEN 10 AND 240),
  CHECK (requested_duration_minutes IS NULL OR preferred_start_datetime IS NULL OR requested_duration_minutes <= (julianday(preferred_end_datetime) - julianday(preferred_start_datetime)) * 1440 + 0.01),
  CHECK ((assigned_start_datetime IS NULL) = (assigned_end_datetime IS NULL)),
  CHECK (assigned_start_datetime IS NULL OR assigned_end_datetime > assigned_start_datetime),
  CHECK (assigned_room_number IS NULL OR assigned_room_number >= 1)
);

CREATE INDEX IF NOT EXISTS idx_external_lottery_studio_state
  ON external_lottery_applications(external_studio_id, state, created_at);

CREATE INDEX IF NOT EXISTS idx_external_lottery_identity_time
  ON external_lottery_applications(group_id, user_id, state, preferred_start_datetime, preferred_end_datetime);

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

CREATE TABLE hall_lotteries (
  target_band_type TEXT NOT NULL CHECK(target_band_type IN ('MAIN','FREE')),
  id TEXT PRIMARY KEY, name TEXT NOT NULL, start_date TEXT NOT NULL, end_date TEXT NOT NULL,
  deadline_date TEXT NOT NULL, duration_minutes INTEGER NOT NULL CHECK(duration_minutes BETWEEN 10 AND 240),
  draw_at TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'OPEN' CHECK(state IN ('OPEN','DRAWING','COMPLETED','CANCELLED')),
  draw_order TEXT, created_at TEXT NOT NULL,
  CHECK(start_date <= end_date AND deadline_date < start_date)
);
CREATE TABLE hall_lottery_applications (
  id TEXT PRIMARY KEY, lottery_id TEXT NOT NULL REFERENCES hall_lotteries(id),
  group_id TEXT NOT NULL REFERENCES groups(id), user_id TEXT NOT NULL REFERENCES users(id),
  state TEXT NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','WON','LOST','CANCELLED')),
  winning_rank INTEGER CHECK(winning_rank BETWEEN 1 AND 3), reservation_id TEXT,
  assigned_start TEXT, assigned_end TEXT, created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX hall_lottery_one_band ON hall_lottery_applications(lottery_id,group_id) WHERE state != 'CANCELLED';
CREATE TABLE hall_lottery_preferences (
  application_id TEXT NOT NULL REFERENCES hall_lottery_applications(id),
  rank INTEGER NOT NULL CHECK(rank BETWEEN 1 AND 3), start_time TEXT NOT NULL,
  PRIMARY KEY(application_id,rank), UNIQUE(application_id,start_time)
);
-- A unique commit marker makes the entire D1 batch fail on concurrent/repeated commits.
CREATE TABLE hall_lottery_commits (lottery_id TEXT PRIMARY KEY REFERENCES hall_lotteries(id));
ALTER TABLE reservations ADD COLUMN hall_lottery_application_id TEXT REFERENCES hall_lottery_applications(id);
CREATE UNIQUE INDEX reservation_hall_lottery_application ON reservations(hall_lottery_application_id) WHERE hall_lottery_application_id IS NOT NULL;
-- Recheck the read snapshot at the atomic commit boundary, including member conflicts.
CREATE TRIGGER hall_lottery_reservation_conflict BEFORE INSERT ON reservations
WHEN NEW.hall_lottery_application_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'HALL_LOTTERY_GROUP_INELIGIBLE') WHERE NOT EXISTS (
    SELECT 1 FROM hall_lottery_applications a JOIN hall_lotteries l ON l.id = a.lottery_id
    JOIN groups g ON g.id = a.group_id
    WHERE a.id = NEW.hall_lottery_application_id AND g.is_active = 1
      AND ((l.target_band_type = 'MAIN' AND g.main_index IS NOT NULL)
        OR (l.target_band_type = 'FREE' AND g.main_index IS NULL))
  );
  SELECT RAISE(ABORT, 'HALL_LOTTERY_CONFLICT') WHERE
    EXISTS (SELECT 1 FROM reservations r WHERE r.state IN ('PENDING','CONFIRMED') AND r.start_time < NEW.end_time AND r.end_time > NEW.start_time)
    OR EXISTS (SELECT 1 FROM unavailable_periods p WHERE p.start_datetime < NEW.end_time AND p.end_datetime > NEW.start_time)
    OR EXISTS (SELECT 1 FROM external_reservations r WHERE r.state IN ('PENDING','CONFIRMED') AND r.start_time < NEW.end_time AND r.end_time > NEW.start_time
      AND EXISTS (SELECT 1 FROM group_member_instruments m WHERE m.group_id = NEW.group_id AND
        (m.user_id = r.user_id OR EXISTS (SELECT 1 FROM group_member_instruments other WHERE other.group_id = r.group_id AND other.user_id = m.user_id))));
END;

CREATE TRIGGER hall_lottery_commit_state BEFORE INSERT ON hall_lottery_commits
BEGIN
  SELECT RAISE(ABORT, 'HALL_LOTTERY_NOT_DRAWING') WHERE NOT EXISTS (
    SELECT 1 FROM hall_lotteries WHERE id = NEW.lottery_id AND state = 'DRAWING'
  );
END;
