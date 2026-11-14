-- Standard product name for items said as slang or a nickname ("mud" → "joint compound").
-- Filled in by parse-materials; null when the item text already is the standard name.
alter table public.materials add column official_name text;
