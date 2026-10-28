-- A1: personal tables for the UTSC website.
--
-- Source of truth for field meanings: the private interface contract
-- contracts/schemas/user-record.schema.json at upstream data-repo commit
-- b828553f91cf6cd6ae5b0766e7fbf4c6b1822535 (reviewed jointly; the schema file
-- itself is NOT copied into the website's public assets).
--
-- Contract → relational mapping (how to rebuild the contract record for a
-- user is documented per table below):
--   user_id                     → profiles.id (= auth.users.id, uuid)
--   completed_course_ids        → profiles.completed_course_ids (text[])
--   confirmed_skills[]          → user_skills rows
--   experiences[]               → experiences rows
--   favorites[]                 → favorites rows
--   learning_paths[]            → learning_paths rows, items[] → path_items rows
--
-- Contract enums are used verbatim (roleId, skillId pattern, confirmed-skill
-- source, favorite target_type, path item status). No enum is renamed or
-- extended here.

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  completed_course_ids text[] not null default '{}'
    constraint profiles_course_ids_nonempty
    check (not ('' = any (completed_course_ids))),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Contract mapping: id = user_record.user_id; completed_course_ids = completed_course_ids. '
  'display_name is a website-only convenience label and is NOT part of the contract export. '
  'Rebuild: {"user_id": id, "completed_course_ids": completed_course_ids}.';

-- ---------------------------------------------------------------------------
-- experiences  (contract: experience_id, text, created_at, updated_at)
-- ---------------------------------------------------------------------------
create table public.experiences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  text text not null
    constraint experiences_text_minlength check (char_length(text) >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.experiences is
  'Contract mapping: id = experience_id (uuid rendered as string), text = text, '
  'created_at/updated_at as stored (timestamptz, UTC). '
  'Rebuild: one array entry per row of the owning user.';

create index experiences_user_id_idx on public.experiences (user_id);

-- ---------------------------------------------------------------------------
-- user_skills  (contract confirmed_skills: skill_id, source, source_id,
-- confirmed_at)
-- ---------------------------------------------------------------------------
create table public.user_skills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  skill_id text not null
    constraint user_skills_skill_id_pattern check (skill_id ~ '^[a-z][a-z0-9_]*$'),
  source text not null
    constraint user_skills_source_enum check (source in ('course', 'experience', 'manual')),
  source_id text,
  confirmed_at timestamptz not null default now(),
  constraint user_skills_identity_unique unique nulls not distinct (user_id, skill_id, source, source_id)
);

comment on table public.user_skills is
  'Contract mapping: rows = confirmed_skills[]. skill_id/source/source_id/confirmed_at stored as-is '
  '(source is one of course/experience/manual; source_id may be null; NULLS NOT DISTINCT keeps '
  'identical null source_id entries unique). Candidate skills are never inserted here automatically. '
  'Rebuild: one array entry per row of the owning user.';

create index user_skills_user_id_idx on public.user_skills (user_id);

-- ---------------------------------------------------------------------------
-- favorites  (contract: target_type, target_id, created_at)
-- ---------------------------------------------------------------------------
create table public.favorites (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  target_type text not null
    constraint favorites_target_type_enum check (target_type in ('resource', 'opportunity')),
  target_id text not null
    constraint favorites_target_id_minlength check (char_length(target_id) >= 1),
  created_at timestamptz not null default now(),
  primary key (user_id, target_type, target_id)
);

comment on table public.favorites is
  'Contract mapping: rows = favorites[]. Composite primary key prevents the same user from '
  'favoriting the same target twice (idempotent re-favorite). '
  'Rebuild: one array entry per row of the owning user.';

-- ---------------------------------------------------------------------------
-- learning_paths  (contract: path_id, target_role_id, created_at, items[])
-- ---------------------------------------------------------------------------
create table public.learning_paths (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  target_role_id text not null
    constraint learning_paths_target_role_enum check (
      target_role_id in (
        'data_analyst',
        'business_analyst',
        'bi_analyst',
        'data_scientist',
        'data_engineer',
        'product_analyst',
        'operations_analyst',
        'financial_risk_analyst'
      )
    ),
  created_at timestamptz not null default now(),
  -- Referenced by the composite foreign key on path_items so an item can only
  -- ever attach to a path owned by the same user.
  constraint learning_paths_id_user_unique unique (id, user_id)
);

comment on table public.learning_paths is
  'Contract mapping: id = path_id (uuid rendered as string), target_role_id = target_role_id '
  '(verbatim shared roleId enum). '
  'Rebuild: one learning_paths entry per row; items[] assembled from path_items below.';

create index learning_paths_user_id_idx on public.learning_paths (user_id);

-- ---------------------------------------------------------------------------
-- path_items  (contract path items: item_id, resource_id, skill_id, status,
-- updated_at)
-- ---------------------------------------------------------------------------
create table public.path_items (
  id uuid primary key default gen_random_uuid(),
  path_id uuid not null,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  resource_id text
    constraint path_items_resource_id_minlength check (resource_id is null or char_length(resource_id) >= 1),
  skill_id text
    constraint path_items_skill_id_pattern check (skill_id is null or skill_id ~ '^[a-z][a-z0-9_]*$'),
  status text not null
    constraint path_items_status_enum check (status in ('not_started', 'in_progress', 'completed')),
  updated_at timestamptz not null default now(),
  -- Double ownership enforced by the database itself, not just RLS: the
  -- (path_id, user_id) pair must reference a row of learning_paths with the
  -- SAME user, so an item can never be attached to somebody else's path.
  constraint path_items_path_owner_fk
    foreign key (path_id, user_id)
    references public.learning_paths (id, user_id)
    on delete cascade
);

comment on table public.path_items is
  'Contract mapping: rows = learning_paths[].items[]. id = item_id (uuid rendered as string), '
  'resource_id/skill_id stored as-is (nullable), status verbatim enum. '
  'The composite foreign key guarantees the parent path belongs to the same user. '
  'Rebuild: group rows by path_id under the owning user''s learning_paths entry.';

create index path_items_path_id_idx on public.path_items (path_id);
create index path_items_user_id_idx on public.path_items (user_id);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger experiences_set_updated_at
  before update on public.experiences
  for each row execute function public.set_updated_at();

create trigger path_items_set_updated_at
  before update on public.path_items
  for each row execute function public.set_updated_at();

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Auto-create the profile row when an auth user signs up
-- ---------------------------------------------------------------------------
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Privileges: personal tables are for signed-in owners only.
-- The anon (signed-out) role gets NO privileges at all; authenticated users
-- get plain DML only. There is no admin role and no client-reachable path to
-- elevated privileges.
--
-- user_id columns default to auth.uid(): clients never need to send an owner
-- value, and an attempt to send somebody else's id is rejected by the RLS
-- WITH CHECK clauses below.
-- ---------------------------------------------------------------------------
revoke all on table public.profiles from anon, authenticated;
revoke all on table public.experiences from anon, authenticated;
revoke all on table public.user_skills from anon, authenticated;
revoke all on table public.favorites from anon, authenticated;
revoke all on table public.learning_paths from anon, authenticated;
revoke all on table public.path_items from anon, authenticated;

grant select, insert, update, delete on table public.profiles to authenticated;
grant select, insert, update, delete on table public.experiences to authenticated;
grant select, insert, update, delete on table public.user_skills to authenticated;
grant select, insert, update, delete on table public.favorites to authenticated;
grant select, insert, update, delete on table public.learning_paths to authenticated;
grant select, insert, update, delete on table public.path_items to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security: every table is owner-scoped. Signed-out users pass no
-- policy (and hold no grants); signed-in users can only touch their own rows.
-- UPDATE policies check both the existing row (USING) and the modified row
-- (WITH CHECK), so user_id cannot be transferred.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.experiences enable row level security;
alter table public.user_skills enable row level security;
alter table public.favorites enable row level security;
alter table public.learning_paths enable row level security;
alter table public.path_items enable row level security;

create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy profiles_insert_own on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()));

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy profiles_delete_own on public.profiles
  for delete to authenticated
  using (id = (select auth.uid()));

create policy experiences_select_own on public.experiences
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy experiences_insert_own on public.experiences
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy experiences_update_own on public.experiences
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy experiences_delete_own on public.experiences
  for delete to authenticated
  using (user_id = (select auth.uid()));

create policy user_skills_select_own on public.user_skills
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy user_skills_insert_own on public.user_skills
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy user_skills_update_own on public.user_skills
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy user_skills_delete_own on public.user_skills
  for delete to authenticated
  using (user_id = (select auth.uid()));

create policy favorites_select_own on public.favorites
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy favorites_insert_own on public.favorites
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy favorites_update_own on public.favorites
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy favorites_delete_own on public.favorites
  for delete to authenticated
  using (user_id = (select auth.uid()));

create policy learning_paths_select_own on public.learning_paths
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy learning_paths_insert_own on public.learning_paths
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy learning_paths_update_own on public.learning_paths
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy learning_paths_delete_own on public.learning_paths
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- path_items: owner check on the row itself AND on the referenced path, so a
-- signed-in user cannot re-point an item at another user's path either.
create policy path_items_select_own on public.path_items
  for select to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.learning_paths lp
      where lp.id = path_id and lp.user_id = (select auth.uid())
    )
  );

create policy path_items_insert_own on public.path_items
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.learning_paths lp
      where lp.id = path_id and lp.user_id = (select auth.uid())
    )
  );

create policy path_items_update_own on public.path_items
  for update to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.learning_paths lp
      where lp.id = path_id and lp.user_id = (select auth.uid())
    )
  )
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.learning_paths lp
      where lp.id = path_id and lp.user_id = (select auth.uid())
    )
  );

create policy path_items_delete_own on public.path_items
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.learning_paths lp
      where lp.id = path_id and lp.user_id = (select auth.uid())
    )
  );
