ALTER TABLE groups ADD COLUMN main_index INTEGER;

UPDATE groups AS target
SET main_index = (
  SELECT COUNT(*) - 1
  FROM groups AS preceding
  WHERE preceding.is_main = TRUE
    AND (
      preceding.created_at > target.created_at
      OR (preceding.created_at = target.created_at AND preceding.id >= target.id)
    )
)
WHERE target.is_main = TRUE;

ALTER TABLE groups DROP COLUMN is_main;

CREATE UNIQUE INDEX idx_groups_main_index
  ON groups(main_index) WHERE main_index IS NOT NULL;
