ALTER TABLE users
ADD COLUMN email_notification_preference_code INTEGER NOT NULL DEFAULT 510510
CHECK (email_notification_preference_code >= 1);
