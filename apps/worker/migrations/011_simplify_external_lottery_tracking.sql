DROP TABLE IF EXISTS external_lottery_limit_holds;
DROP TABLE IF EXISTS external_reservation_usage;

ALTER TABLE external_lottery_applications DROP COLUMN tie_breaker;
ALTER TABLE external_lottery_applications DROP COLUMN tie_break_rank;
