-- The kind of job ("drywall", "bath", "handyman"…), picked from tiles when a job is created.
-- Plain text holding an id from src/data/jobKinds.ts, so new kinds need no migration.
-- Null when the contractor skipped it, and for every job made before this.
alter table public.jobs add column trade text;
