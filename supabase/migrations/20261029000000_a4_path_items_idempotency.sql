-- A4: make repeated adds of the same resource/skill to one path idempotent.
--
-- Scope: learning_paths and path_items tables from the A1 migration are reused
-- unchanged (same columns, same contract enums, same RLS). This migration adds
-- only two partial unique indexes; it does NOT reset, delete, rewrite or
-- auto-deduplicate any existing personal row, does NOT relax RLS, and does NOT
-- touch the shared contract schemas.
--
-- Contract mapping (unchanged): path_items rows = learning_paths[].items[].
-- A path item is identified for the user by (path, resource) or (path, skill):
--   - adding the same resource twice to one path is a no-op;
--   - adding the same skill twice to one path is a no-op;
--   - adding a resource and a skill remains two independent items.
--
-- Non-destructive by construction: CREATE UNIQUE INDEX fails loudly if any
-- environment already holds duplicates. In that case an operator must resolve
-- the duplicates deliberately (the website never merges or deletes personal
-- items by itself). At creation time the local isolated stack held 0 rows in
-- learning_paths and path_items (verified physically), so nothing could be
-- lost; the indexes are validated immediately because NOT VALID does not
-- apply to unique indexes.

create unique index path_items_one_row_per_resource
  on public.path_items (path_id, resource_id)
  where resource_id is not null;

create unique index path_items_one_row_per_skill
  on public.path_items (path_id, skill_id)
  where skill_id is not null;

comment on index path_items_one_row_per_resource is
  'A4 idempotency: at most one path_items row per (path, resource). Re-adds '
  'surface as 23505 and are treated as success by the website; existing item '
  'status is never reset by an add.';

comment on index path_items_one_row_per_skill is
  'A4 idempotency: at most one path_items row per (path, skill). Re-adds '
  'surface as 23505 and are treated as success by the website; existing item '
  'status is never reset by an add.';
