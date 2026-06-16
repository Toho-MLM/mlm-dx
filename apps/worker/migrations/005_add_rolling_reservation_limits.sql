CREATE TABLE IF NOT EXISTS reservation_limits_next (
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

INSERT INTO reservation_limits_next (
  id,
  scope,
  limit_type,
  start_datetime,
  end_datetime,
  window_days,
  max_minutes,
  created_at,
  updated_at
)
SELECT
  id,
  scope,
  'FIXED',
  start_datetime,
  end_datetime,
  NULL,
  max_minutes,
  created_at,
  updated_at
FROM reservation_limits;

DROP TABLE reservation_limits;
ALTER TABLE reservation_limits_next RENAME TO reservation_limits;
