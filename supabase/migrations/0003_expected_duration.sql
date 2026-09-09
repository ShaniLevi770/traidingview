-- Adds "how long did you expect this trade to take to reach profit" - a
-- pre-trade planning field, distinct from the actual entry/exit dates.
alter table trades add column expected_duration text;
