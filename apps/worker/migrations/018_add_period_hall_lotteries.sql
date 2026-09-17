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
