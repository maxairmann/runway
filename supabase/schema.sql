-- Runway: your PTO plan, synced across your devices.
-- Run this once in the Supabase SQL editor (Database → SQL Editor → New query).
--
-- Design: a plan (rules and trips) is one JSON document. Last write wins, and
-- realtime pushes each save to your other devices. Access is enforced in
-- Postgres with row-level security: you can only read or change your own plan.

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  data jsonb not null,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

create table if not exists public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

alter table public.households enable row level security;
alter table public.household_members enable row level security;

-- Membership check used by every policy. Security definer so it can read
-- household_members without recursing through that table's own policy.
create or replace function public.is_household_member(h uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.household_members
    where household_id = h and user_id = auth.uid()
  );
$$;

drop policy if exists "members read their household" on public.households;
create policy "members read their household" on public.households
  for select using (public.is_household_member(id));

drop policy if exists "members edit their household" on public.households;
create policy "members edit their household" on public.households
  for update using (public.is_household_member(id)) with check (public.is_household_member(id));

drop policy if exists "owner deletes household" on public.households;
create policy "owner deletes household" on public.households
  for delete using (created_by = auth.uid());

drop policy if exists "members see each other" on public.household_members;
create policy "members see each other" on public.household_members
  for select using (public.is_household_member(household_id));

drop policy if exists "members can leave" on public.household_members;
create policy "members can leave" on public.household_members
  for delete using (user_id = auth.uid());

-- Stamp every save.
create or replace function public.touch_household()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists households_touch on public.households;
create trigger households_touch before update on public.households
  for each row execute function public.touch_household();

-- Inserts go through this function so a plan and its owner are created together.

create or replace function public.create_household(p_name text, p_data jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in first';
  end if;
  insert into public.households (name, data, created_by)
  values (p_name, p_data, auth.uid())
  returning id into new_id;
  insert into public.household_members (household_id, user_id, role)
  values (new_id, auth.uid(), 'owner');
  return new_id;
end;
$$;

revoke all on function public.create_household(text, jsonb) from anon;

-- Push each save to your other devices.
do $$
begin
  alter publication supabase_realtime add table public.households;
exception when duplicate_object then null;
end $$;

-- Account requests from the landing page. Only the server (api/request.js and
-- api/invite.js, using the secret key) can read or write them: RLS is on with no policies.
create table if not exists public.account_requests (
  email text primary key,
  created_at timestamptz not null default now()
);
alter table public.account_requests enable row level security;
