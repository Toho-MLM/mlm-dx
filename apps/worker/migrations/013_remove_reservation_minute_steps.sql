CREATE TABLE external_lottery_applications_new (
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

INSERT INTO external_lottery_applications_new (
  id, external_studio_id, user_id, group_id,
  preferred_start_datetime, preferred_end_datetime, requested_duration_minutes,
  state, fairness_score, assigned_room_number,
  assigned_start_datetime, assigned_end_datetime, created_at, updated_at
)
SELECT
  id, external_studio_id, user_id, group_id,
  preferred_start_datetime, preferred_end_datetime, requested_duration_minutes,
  state, fairness_score, assigned_room_number,
  assigned_start_datetime, assigned_end_datetime, created_at, updated_at
FROM external_lottery_applications;

DROP TABLE external_lottery_applications;
ALTER TABLE external_lottery_applications_new RENAME TO external_lottery_applications;

CREATE INDEX idx_external_lottery_studio_state
  ON external_lottery_applications(external_studio_id, state, created_at);

CREATE INDEX idx_external_lottery_identity_time
  ON external_lottery_applications(group_id, user_id, state, preferred_start_datetime, preferred_end_datetime);
