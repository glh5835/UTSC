-- A3: keep explicit skill confirmations tied to their stated source.
--
-- Source of truth for the public fields:
-- contracts/user-record and experience-skill-extraction rules at upstream
-- commit b828553f91cf6cd6ae5b0766e7fbf4c6b1822535. This migration does not add
-- contract fields and does not change the source enum.

-- Bound user-authored experience text. NOT VALID avoids rejecting pre-existing
-- rows while enforcing the limit for every new insert/update.
alter table public.experiences
  add constraint experiences_text_maxlength
  check (char_length(text) <= 5000) not valid;

alter table public.user_skills
  add constraint user_skills_source_id_maxlength
  check (source_id is null or char_length(source_id) <= 200) not valid;

create index user_skills_source_idx
  on public.user_skills (user_id, source, source_id);

-- Validate every created/updated confirmation. A course source must reference a
-- course currently marked complete by the same owner; an experience source
-- must reference that owner's experience row; a manual confirmation has no
-- source record. The UI enforces canonical IDs; this trigger prevents dangling
-- internal sources and ties the row to the owner at database level.
create function public.validate_user_skill_source()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.source = 'manual' then
    if new.source_id is not null then
      raise exception 'manual skill confirmation must not have a source_id';
    end if;
    return new;
  end if;

  if new.source = 'course' then
    if new.source_id is null or btrim(new.source_id) = '' then
      raise exception 'course skill confirmation requires a course source_id';
    end if;
    if not exists (
      select 1
      from public.profiles p
      where p.id = new.user_id
        and new.source_id = any (p.completed_course_ids)
    ) then
      raise exception 'course source_id must be a completed course of the same user';
    end if;
    return new;
  end if;

  if new.source = 'experience' then
    if new.source_id is null or btrim(new.source_id) = '' then
      raise exception 'experience skill confirmation requires an experience source_id';
    end if;
    if not exists (
      select 1
      from public.experiences e
      where e.id::text = new.source_id
        and e.user_id = new.user_id
    ) then
      raise exception 'experience source_id must belong to the same user';
    end if;
    return new;
  end if;

  raise exception 'unsupported skill confirmation source';
end;
$$;

create trigger user_skills_validate_source
  before insert or update of user_id, source, source_id on public.user_skills
  for each row execute function public.validate_user_skill_source();

-- Editing experience text invalidates evidence extracted from the old text.
-- Deleting an experience removes only confirmations whose source is that
-- experience; manual and course confirmations remain. This runs even for a
-- direct PostgREST delete, so the database never keeps a dangling source.
create function public.cleanup_experience_skill_sources()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.user_skills
    where user_id = old.user_id
      and source = 'experience'
      and source_id = old.id::text;
    return old;
  end if;

  if new.text is distinct from old.text then
    delete from public.user_skills
    where user_id = old.user_id
      and source = 'experience'
      and source_id = old.id::text;
  end if;
  return new;
end;
$$;

create trigger experiences_cleanup_skill_sources
  after update of text or delete on public.experiences
  for each row execute function public.cleanup_experience_skill_sources();

-- Withdrawing a completed course removes only course-sourced confirmations for
-- that course. Other courses, experiences and manual confirmations are kept.
create function public.cleanup_course_skill_sources()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.user_skills
  where user_id = new.id
    and source = 'course'
    and source_id is not null
    and not (source_id = any (new.completed_course_ids));
  return new;
end;
$$;

create trigger profiles_cleanup_course_skill_sources
  after update of completed_course_ids on public.profiles
  for each row execute function public.cleanup_course_skill_sources();
