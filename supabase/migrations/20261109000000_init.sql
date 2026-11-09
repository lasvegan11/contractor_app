-- PROJECT_NAME v1 schema: profiles, jobs, materials. Every table is RLS-locked to its owner.

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  name          text,
  business_name text,
  phone         text,
  lang          text not null default 'en' check (lang in ('en', 'es')),
  created_at    timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: read own" on public.profiles
  for select using (id = (select auth.uid()));
create policy "profiles: insert own" on public.profiles
  for insert with check (id = (select auth.uid()));
create policy "profiles: update own" on public.profiles
  for update using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Create a profile row the moment someone signs up with their phone.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, phone)
  values (new.id, new.phone)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- jobs
-- ---------------------------------------------------------------------------
create table public.jobs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name       text not null check (length(trim(name)) > 0),
  address    text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index jobs_user_updated_idx on public.jobs (user_id, updated_at desc);

alter table public.jobs enable row level security;

create policy "jobs: owner all" on public.jobs
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- materials
-- ---------------------------------------------------------------------------
create table public.materials (
  id         uuid primary key default gen_random_uuid(),
  job_id     uuid not null references public.jobs (id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  qty        numeric,
  unit       text,
  item       text not null check (length(trim(item)) > 0),
  picked_up  boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index materials_job_idx on public.materials (job_id, sort_order);
create index materials_user_idx on public.materials (user_id);

alter table public.materials enable row level security;

-- Owner only, and the job it points at must also be theirs.
create policy "materials: owner all" on public.materials
  for all
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.jobs j
      where j.id = job_id and j.user_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- keep jobs.updated_at fresh (job edits + any material change)
-- ---------------------------------------------------------------------------
create function public.touch_job_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger jobs_touch_updated_at
  before update on public.jobs
  for each row execute function public.touch_job_updated_at();

create function public.touch_job_from_material()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.jobs
     set updated_at = now()
   where id = coalesce(new.job_id, old.job_id);
  return null;
end;
$$;

create trigger materials_touch_job
  after insert or update or delete on public.materials
  for each row execute function public.touch_job_from_material();
