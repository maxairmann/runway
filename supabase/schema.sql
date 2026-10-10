-- Runway: shared PTO plans for a household.
-- Run this once in the Supabase SQL editor (Database → SQL Editor → New query).
--
-- Design: a household's plan (people, policies, trips) is one JSON document.
-- Two people editing a vacation plan rarely collide, so last write wins and
-- realtime pushes each save to the other phone. Access is enforced in Postgres
-- with row-level security: you can only read or change households you belong to.

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

create table if not exists public.household_invites (
  code text primary key,
  household_id uuid not null references public.households (id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  expires_at timestamptz not null default now() + interval '14 days',
  used_by uuid references auth.users (id) on delete set null,
  used_at timestamptz
);

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_invites enable row level security;

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

drop policy if exists "members see invites" on public.household_invites;
create policy "members see invites" on public.household_invites
  for select using (public.is_household_member(household_id));

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

-- Inserts go through these functions so a household and its owner are
-- created together, and joining requires a valid invite code.

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

create or replace function public.create_invite(p_household uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  new_code text;
begin
  if not public.is_household_member(p_household) then
    raise exception 'Not a member of this household';
  end if;
  new_code := substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);
  insert into public.household_invites (code, household_id, created_by)
  values (new_code, p_household, auth.uid());
  return new_code;
end;
$$;

create or replace function public.accept_invite(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.household_invites%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Sign in first';
  end if;
  select * into inv from public.household_invites where code = p_code;
  if not found then
    raise exception 'That invite link is not valid';
  end if;
  if inv.used_by is not null and inv.used_by <> auth.uid() then
    raise exception 'That invite link was already used';
  end if;
  if inv.expires_at < now() then
    raise exception 'That invite link has expired';
  end if;
  insert into public.household_members (household_id, user_id, role)
  values (inv.household_id, auth.uid(), 'member')
  on conflict do nothing;
  update public.household_invites set used_by = auth.uid(), used_at = now() where code = p_code;
  return inv.household_id;
end;
$$;

revoke all on function public.create_household(text, jsonb) from anon;
revoke all on function public.create_invite(uuid) from anon;
revoke all on function public.accept_invite(text) from anon;

-- Push each save to the other person's phone.
do $$
begin
  alter publication supabase_realtime add table public.households;
exception when duplicate_object then null;
end $$;
