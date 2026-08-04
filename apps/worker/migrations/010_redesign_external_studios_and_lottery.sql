DROP TABLE external_reservations;
DROP TABLE external_studios;

CREATE TABLE external_studios (
  id TEXT PRIMARY KEY,
  start_datetime DATETIME NOT NULL,
  end_datetime DATETIME NOT NULL,
  room_names TEXT NOT NULL CHECK (json_valid(room_names) AND json_type(room_names) = 'array' AND json_array_length(room_names) > 0),
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  CHECK (end_datetime > start_datetime)
);

CREATE TABLE external_reservations (
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

CREATE INDEX idx_external_reservations_room_time
  ON external_reservations(external_studio_id, room_number, state, start_time, end_time);

CREATE TABLE external_lottery_applications (
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

CREATE INDEX idx_external_lottery_studio_state
  ON external_lottery_applications(external_studio_id, state, created_at);

CREATE INDEX idx_external_lottery_identity_time
  ON external_lottery_applications(group_id, user_id, state, preferred_start_datetime, preferred_end_datetime);

CREATE TABLE external_lottery_limit_holds (
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

CREATE INDEX idx_external_lottery_limit_holds_identity_time
  ON external_lottery_limit_holds(group_id, user_id, start_time, end_time);

CREATE TABLE external_reservation_usage (
  reservation_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  minutes INTEGER NOT NULL CHECK (minutes >= 10),
  used_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (reservation_id, user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
