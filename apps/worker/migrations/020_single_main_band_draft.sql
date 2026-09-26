DELETE FROM main_band_drafts
WHERE id != (
  SELECT id FROM main_band_drafts ORDER BY created_at DESC, id DESC LIMIT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS main_band_drafts_singleton ON main_band_drafts ((1));
