ALTER TABLE external_studios
  ADD COLUMN draw_datetime DATETIME;

UPDATE external_studios
SET draw_datetime = strftime(
  '%Y-%m-%dT12:00:00.000Z',
  start_datetime,
  '+9 hours',
  '-1 day'
)
WHERE target_type = 'HALL';

CREATE INDEX idx_external_studios_due_hall_lottery
  ON external_studios(target_type, draw_datetime);
