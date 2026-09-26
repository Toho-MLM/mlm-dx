CREATE TRIGGER IF NOT EXISTS entries_member_limit_before_insert
BEFORE INSERT ON entries
BEGIN
  SELECT RAISE(ABORT, 'GROUP_LIMIT_EXCEEDED')
  WHERE EXISTS (
    SELECT 1 FROM group_member_instruments member
    JOIN events event ON event.id = NEW.event_id
    WHERE member.group_id = NEW.group_id AND event.group_limit > 0
    GROUP BY member.user_id, event.group_limit
    HAVING (
      SELECT COUNT(DISTINCT entry.group_id)
      FROM entries entry
      JOIN group_member_instruments existing_member ON existing_member.group_id = entry.group_id
      WHERE entry.event_id = NEW.event_id AND existing_member.user_id = member.user_id
    ) >= event.group_limit
  );
END;
