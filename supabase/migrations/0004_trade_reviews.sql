-- Supports two things asked for together: (1) capturing *why* a trade was
-- exited, as a companion to the existing `thesis` field (why it was
-- entered) - so a closed trade carries both halves of the reasoning, next
-- to the plan it was measured against (planned_stop/planned_target already
-- link entry/stop/target as one row). (2) letting the existing
-- post-trade-diagnosis engine (lib/analytics/postTradeDiagnosis.ts) surface
-- itself automatically, once a trade has had a month to "resolve" after
-- exit, instead of only running on-demand from the Journal's bulk action.
--
-- The diagnosis is persisted (not recomputed on every page load) both to
-- avoid repeat Stooq calls for the same trade and so "have I seen this
-- review yet" is trackable.

alter table trades add column exit_reason text;
alter table trades add column diagnosis jsonb;
alter table trades add column diagnosis_generated_at timestamptz;
alter table trades add column diagnosis_viewed_at timestamptz;
