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
  start_datetime DATETIME NOT NULL,
  end_datetime DATETIME NOT NULL,
  room_names TEXT NOT NULL CHECK (json_valid(room_names) AND json_type(room_names) = 'array' AND json_array_length(room_names) > 0),
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  CHECK (end_datetime > start_datetime)
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
  tie_breaker TEXT NOT NULL,
  tie_break_rank INTEGER,
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
  CHECK (preferred_start_datetime IS NULL OR date(preferred_start_datetime, '+9 hours') = date(preferred_end_datetime, '+9 hours')),
  CHECK (preferred_start_datetime IS NULL OR (time(preferred_start_datetime, '+9 hours') >= time('06:00:00') AND time(preferred_end_datetime, '+9 hours') <= time('23:00:00'))),
  CHECK (requested_duration_minutes IS NULL OR (requested_duration_minutes BETWEEN 10 AND 240 AND requested_duration_minutes % 5 = 0)),
  CHECK (requested_duration_minutes IS NULL OR preferred_start_datetime IS NULL OR requested_duration_minutes <= (julianday(preferred_end_datetime) - julianday(preferred_start_datetime)) * 1440 + 0.01),
  CHECK ((assigned_start_datetime IS NULL) = (assigned_end_datetime IS NULL)),
  CHECK (assigned_start_datetime IS NULL OR assigned_end_datetime > assigned_start_datetime),
  CHECK (assigned_room_number IS NULL OR assigned_room_number >= 1)
);

CREATE INDEX IF NOT EXISTS idx_external_lottery_studio_state
  ON external_lottery_applications(external_studio_id, state, created_at);

CREATE INDEX IF NOT EXISTS idx_external_lottery_identity_time
  ON external_lottery_applications(group_id, user_id, state, preferred_start_datetime, preferred_end_datetime);

CREATE TRIGGER IF NOT EXISTS validate_external_lottery_application_insert
BEFORE INSERT ON external_lottery_applications
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM external_studios es
    WHERE es.id = NEW.external_studio_id
      AND (NEW.preferred_start_datetime IS NULL OR (
        NEW.preferred_start_datetime >= es.start_datetime
        AND NEW.preferred_end_datetime <= es.end_datetime
      ))
      AND date(COALESCE(NEW.preferred_start_datetime, es.start_datetime), '+9 hours')
        BETWEEN date(NEW.created_at, '+9 hours', '+1 day') AND date(NEW.created_at, '+9 hours', '+14 days')
  ) THEN RAISE(ABORT, 'INVALID_EXTERNAL_LOTTERY_PERIOD') END;
END;

CREATE TABLE IF NOT EXISTS external_lottery_limit_holds (
  application_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  group_id TEXT,
  start_time DATETIME NOT NULL,
  end_time DATETIME NOT NULL,
  created_at DATETIME NOT NULL,
  FOREIGN KEY (application_id) REFERENCES external_lottery_applications(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
  CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_external_lottery_limit_holds_identity_time
  ON external_lottery_limit_holds(group_id, user_id, start_time, end_time);

CREATE TABLE IF NOT EXISTS external_reservation_usage (
  reservation_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  minutes INTEGER NOT NULL CHECK (minutes >= 10),
  used_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (reservation_id, user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
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
