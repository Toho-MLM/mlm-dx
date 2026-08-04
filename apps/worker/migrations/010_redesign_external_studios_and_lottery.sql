PRAGMA defer_foreign_keys = TRUE;

CREATE TEMP TABLE external_studio_room_map AS
SELECT
  id AS old_id,
  FIRST_VALUE(id) OVER (
    PARTITION BY start_datetime, end_datetime
    ORDER BY created_at ASC, id ASC
  ) AS new_id,
  ROW_NUMBER() OVER (
    PARTITION BY start_datetime, end_datetime
    ORDER BY created_at ASC, id ASC
  ) AS room_number
FROM external_studios;

CREATE TABLE external_studios_new (
  id TEXT PRIMARY KEY,
  start_datetime DATETIME NOT NULL,
  end_datetime DATETIME NOT NULL,
  room_names TEXT NOT NULL CHECK (json_valid(room_names) AND json_type(room_names) = 'array' AND json_array_length(room_names) > 0),
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  CHECK (end_datetime > start_datetime)
);

INSERT INTO external_studios_new (id, start_datetime, end_datetime, room_names, created_at, updated_at)
SELECT
  mapping.new_id,
  source.start_datetime,
  source.end_datetime,
  (
    SELECT json_group_array(ordered_rooms.name)
    FROM (
      SELECT es2.name
      FROM external_studios es2
      WHERE es2.start_datetime = source.start_datetime
        AND es2.end_datetime = source.end_datetime
      ORDER BY es2.created_at ASC, es2.id ASC
    ) AS ordered_rooms
  ),
  MIN(source.created_at),
  MAX(source.updated_at)
FROM external_studios source
INNER JOIN external_studio_room_map mapping ON mapping.old_id = source.id
GROUP BY source.start_datetime, source.end_datetime, mapping.new_id;

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
  FOREIGN KEY (external_studio_id) REFERENCES external_studios_new(id) ON DELETE CASCADE,
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

INSERT INTO external_lottery_applications (
  id, external_studio_id, user_id, group_id,
  preferred_start_datetime, preferred_end_datetime, requested_duration_minutes,
  state, fairness_score, tie_breaker, tie_break_rank,
  assigned_room_number, assigned_start_datetime, assigned_end_datetime,
  created_at, updated_at
)
SELECT
  er.id, mapping.new_id, er.user_id, er.group_id,
  er.start_time, er.end_time, NULL,
  'PENDING', NULL, lower(hex(randomblob(16))), NULL,
  NULL, NULL, NULL,
  er.created_at, er.updated_at
FROM external_reservations er
INNER JOIN external_studio_room_map mapping ON mapping.old_id = er.external_studio_id
WHERE er.state = 'PENDING'
  AND datetime(er.start_time) > datetime('now');

CREATE TABLE external_reservations_new (
  id TEXT PRIMARY KEY,
  external_studio_id TEXT NOT NULL,
  room_number INTEGER NOT NULL CHECK (room_number >= 1),
  user_id TEXT NOT NULL,
  group_id TEXT,
  start_time DATETIME NOT NULL,
  end_time DATETIME NOT NULL,
  state TEXT NOT NULL DEFAULT 'CONFIRMED' CHECK (state IN ('PENDING','WITHDRAWN','DECLINED','CONFIRMED','CANCELLED','COMPLETED')),
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  FOREIGN KEY (external_studio_id) REFERENCES external_studios_new(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
  CHECK (end_time > start_time)
);

INSERT INTO external_reservations_new (
  id, external_studio_id, room_number, user_id, group_id,
  start_time, end_time, state, created_at, updated_at
)
SELECT
  er.id, mapping.new_id, mapping.room_number, er.user_id, er.group_id,
  er.start_time, er.end_time, er.state, er.created_at, er.updated_at
FROM external_reservations er
INNER JOIN external_studio_room_map mapping ON mapping.old_id = er.external_studio_id
WHERE NOT (er.state = 'PENDING' AND datetime(er.start_time) > datetime('now'));

DROP TABLE external_reservations;
DROP TABLE external_studios;
ALTER TABLE external_studios_new RENAME TO external_studios;
ALTER TABLE external_reservations_new RENAME TO external_reservations;

CREATE INDEX idx_external_reservations_room_time
  ON external_reservations(external_studio_id, room_number, state, start_time, end_time);
CREATE INDEX idx_external_lottery_studio_state
  ON external_lottery_applications(external_studio_id, state, created_at);
CREATE INDEX idx_external_lottery_identity_time
  ON external_lottery_applications(group_id, user_id, state, preferred_start_datetime, preferred_end_datetime);

CREATE TRIGGER validate_external_lottery_application_insert
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

INSERT INTO external_lottery_limit_holds (application_id, user_id, group_id, start_time, end_time, created_at)
SELECT id, user_id, group_id, preferred_start_datetime, preferred_end_datetime, created_at
FROM external_lottery_applications
WHERE state = 'PENDING';

CREATE TABLE external_reservation_usage (
  reservation_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  minutes INTEGER NOT NULL CHECK (minutes >= 10),
  used_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (reservation_id, user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

INSERT OR IGNORE INTO external_reservation_usage (reservation_id, user_id, minutes, used_at, created_at)
SELECT er.id, gmi.user_id,
       CAST(ROUND((julianday(er.end_time) - julianday(er.start_time)) * 1440) AS INTEGER),
       er.start_time, er.updated_at
FROM external_reservations er
INNER JOIN group_member_instruments gmi ON gmi.group_id = er.group_id
WHERE er.state IN ('CONFIRMED', 'COMPLETED')
UNION ALL
SELECT er.id, er.user_id,
       CAST(ROUND((julianday(er.end_time) - julianday(er.start_time)) * 1440) AS INTEGER),
       er.start_time, er.updated_at
FROM external_reservations er
WHERE er.group_id IS NULL AND er.state IN ('CONFIRMED', 'COMPLETED');

DROP TABLE external_studio_room_map;
