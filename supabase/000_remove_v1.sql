-- One-time cleanup of the first version (squad codes, open table access).
--
-- Run once, before schema.sql, and only while the old table holds no real data.
-- It was emptied after testing on Oct 6 2026. Never re-run this once real
-- players have been saved.

drop function if exists public.record_practice(text, text, text[]);
drop table if exists public.players cascade;
drop function if exists public.touch_players_updated_at() cascade;
drop function if exists public.limit_players_per_squad() cascade;
