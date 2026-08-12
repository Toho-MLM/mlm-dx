ALTER TABLE external_studios
  ADD COLUMN target_type TEXT NOT NULL DEFAULT 'EXTERNAL'
  CHECK (target_type IN ('HALL','EXTERNAL'));

CREATE INDEX idx_external_studios_target_time
  ON external_studios(target_type, start_datetime, end_datetime);
