CREATE TRIGGER IF NOT EXISTS reservation_unavailable_insert
BEFORE INSERT ON reservations
WHEN NEW.state IN ('PENDING', 'CONFIRMED')
  AND EXISTS (
    SELECT 1 FROM unavailable_periods p
    WHERE p.start_datetime < NEW.end_time AND p.end_datetime > NEW.start_time
  )
BEGIN
  SELECT RAISE(ABORT, 'BLOCKED_PERIOD_CONFLICT');
END;

CREATE TRIGGER IF NOT EXISTS reservation_unavailable_update
BEFORE UPDATE OF start_time, end_time, state ON reservations
WHEN NEW.state IN ('PENDING', 'CONFIRMED')
  AND EXISTS (
    SELECT 1 FROM unavailable_periods p
    WHERE p.start_datetime < NEW.end_time AND p.end_datetime > NEW.start_time
  )
BEGIN
  SELECT RAISE(ABORT, 'BLOCKED_PERIOD_CONFLICT');
END;
