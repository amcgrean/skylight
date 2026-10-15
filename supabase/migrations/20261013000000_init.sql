-- Family Hub — phase 1 schema
-- Everything is scoped to a household. Row-level security lets a signed-in user
-- read and write only rows for households they are a member of.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Households & members
-- ---------------------------------------------------------------------------
create table public.households (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  invite_code  text not null unique
               default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)),
  timezone     text not null default 'America/Chicago',
  created_at   timestamptz not null default now()
);

create type public.member_kind as enum ('adult', 'child', 'pets', 'grandparent');

-- A member is anyone who can be tagged. Only adults sign in (user_id) and only
-- members with an email receive calendar invites. Grandparents are tag-only.
create table public.members (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households on delete cascade,
  user_id       uuid unique references auth.users on delete set null,
  name          text not null,
  short_name    text not null,
  kind          public.member_kind not null,
  color         text not null,
  email         text,
  sort          int not null default 0,
  created_at    timestamptz not null default now(),
  constraint only_adults_sign_in check (user_id is null or kind = 'adult'),
  constraint only_adults_get_invites check (email is null or kind = 'adult')
);
create index on public.members (household_id);

-- ---------------------------------------------------------------------------
-- Calendar
-- ---------------------------------------------------------------------------
create table public.events (
  id               uuid primary key default gen_random_uuid(),
  household_id     uuid not null references public.households on delete cascade,
  title            text not null check (length(trim(title)) > 0),
  note             text,
  starts_at        timestamptz not null,
  ends_at          timestamptz,
  all_day          boolean not null default false,
  source           text not null default 'manual'
                   check (source in ('manual', 'inbox', 'google', 'icloud')),
  google_event_id  text,
  sync_status      text not null default 'pending'
                   check (sync_status in ('pending', 'synced', 'skipped', 'error')),
  sync_error       text,
  created_by       uuid references public.members on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint ends_after_start check (ends_at is null or ends_at >= starts_at)
);
create index on public.events (household_id, starts_at);

create table public.event_tags (
  event_id   uuid not null references public.events on delete cascade,
  member_id  uuid not null references public.members on delete cascade,
  primary key (event_id, member_id)
);

-- ---------------------------------------------------------------------------
-- Daycare runs: a weekly default pattern plus per-day overrides
-- (swaps, sleepovers, closures). Weekday is ISO: 1 = Monday … 7 = Sunday.
-- ---------------------------------------------------------------------------
create table public.daycare_pattern (
  household_id  uuid not null references public.households on delete cascade,
  weekday       smallint not null check (weekday between 1 and 7),
  drop_member   uuid references public.members on delete set null,
  pick_member   uuid references public.members on delete set null,
  drop_time     time not null default '07:30',
  pick_time     time not null default '17:15',
  primary key (household_id, weekday)
);

create table public.daycare_overrides (
  household_id      uuid not null references public.households on delete cascade,
  day               date not null,
  drop_member       uuid references public.members on delete set null,
  pick_member       uuid references public.members on delete set null,
  sleepover_member  uuid references public.members on delete set null,
  closed            boolean not null default false,
  note              text,
  updated_by        uuid references public.members on delete set null,
  updated_at        timestamptz not null default now(),
  primary key (household_id, day)
);

-- ---------------------------------------------------------------------------
-- Chores
-- ---------------------------------------------------------------------------
create table public.chores (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households on delete cascade,
  title         text not null,
  member_id     uuid not null references public.members on delete cascade,
  points        int not null default 1 check (points between 0 and 100),
  cadence       text not null default 'daily' check (cadence in ('daily', 'weekdays', 'weekly')),
  weekday       smallint check (weekday between 1 and 7),
  active        boolean not null default true,
  sort          int not null default 0,
  created_at    timestamptz not null default now(),
  constraint weekly_needs_day check (cadence <> 'weekly' or weekday is not null)
);
create index on public.chores (household_id);

create table public.chore_completions (
  chore_id      uuid not null references public.chores on delete cascade,
  day           date not null,
  completed_by  uuid references public.members on delete set null,
  completed_at  timestamptz not null default now(),
  primary key (chore_id, day)
);

-- ---------------------------------------------------------------------------
-- Groceries, stores and store learning
-- ---------------------------------------------------------------------------
create table public.stores (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households on delete cascade,
  name          text not null,
  color         text not null,
  sort          int not null default 0,
  unique (household_id, name)
);

create table public.grocery_items (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households on delete cascade,
  name          text not null,
  product_key   text not null,          -- normalized name (or "upc:<code>") used for learning
  upc           text,
  store_id      uuid references public.stores on delete set null,
  checked       boolean not null default false,
  checked_at    timestamptz,
  added_by      uuid references public.members on delete set null,
  created_at    timestamptz not null default now()
);
create index on public.grocery_items (household_id, checked);

-- How many times each product was bought / assigned at each store.
create table public.store_stats (
  household_id  uuid not null references public.households on delete cascade,
  product_key   text not null,
  store_id      uuid not null references public.stores on delete cascade,
  trips         int not null default 0,
  last_at       timestamptz not null default now(),
  primary key (household_id, product_key, store_id)
);

-- Global barcode cache, filled by the upc-lookup edge function.
create table public.products (
  upc         text primary key,
  name        text,
  brand       text,
  source      text,
  found       boolean not null default false,
  fetched_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Meals
-- ---------------------------------------------------------------------------
create table public.meals (
  household_id  uuid not null references public.households on delete cascade,
  day           date not null,
  title         text not null,
  cook_member   uuid references public.members on delete set null,
  cook_label    text,                    -- e.g. "Takeout" when nobody cooks
  primary key (household_id, day)
);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.is_household_member(hid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.members m
    where m.household_id = hid and m.user_id = auth.uid()
  );
$$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger events_touch before update on public.events
  for each row execute function public.touch_updated_at();
create trigger daycare_overrides_touch before update on public.daycare_overrides
  for each row execute function public.touch_updated_at();

-- Lists the adults in a household that nobody has claimed yet (join screen).
create or replace function public.unclaimed_adults(p_invite_code text)
returns table (id uuid, name text, color text)
language sql stable security definer set search_path = public
as $$
  select m.id, m.name, m.color
  from public.members m
  join public.households h on h.id = m.household_id
  where h.invite_code = upper(trim(p_invite_code))
    and m.kind = 'adult' and m.user_id is null
  order by m.sort;
$$;

-- Links the signed-in user to one adult member of the household.
create or replace function public.claim_member(p_invite_code text, p_member_id uuid)
returns public.members
language plpgsql security definer set search_path = public
as $$
declare
  v_member public.members;
begin
  if auth.uid() is null then
    raise exception 'Sign in first';
  end if;
  if exists (select 1 from public.members where user_id = auth.uid()) then
    raise exception 'This account is already linked to a family member';
  end if;

  update public.members m
     set user_id = auth.uid()
    from public.households h
   where m.id = p_member_id
     and m.household_id = h.id
     and h.invite_code = upper(trim(p_invite_code))
     and m.kind = 'adult'
     and m.user_id is null
  returning m.* into v_member;

  if v_member.id is null then
    raise exception 'That invite code or person is not available';
  end if;
  return v_member;
end $$;

-- Adds one "trip" for a product at a store (store learning).
create or replace function public.record_store_trip(p_household uuid, p_product_key text, p_store uuid)
returns void
language plpgsql security invoker set search_path = public
as $$
begin
  insert into public.store_stats (household_id, product_key, store_id, trips, last_at)
  values (p_household, p_product_key, p_store, 1, now())
  on conflict (household_id, product_key, store_id)
  do update set trips = public.store_stats.trips + 1, last_at = now();
end $$;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.households        enable row level security;
alter table public.members           enable row level security;
alter table public.events            enable row level security;
alter table public.event_tags        enable row level security;
alter table public.daycare_pattern   enable row level security;
alter table public.daycare_overrides enable row level security;
alter table public.chores            enable row level security;
alter table public.chore_completions enable row level security;
alter table public.stores            enable row level security;
alter table public.grocery_items     enable row level security;
alter table public.store_stats       enable row level security;
alter table public.products          enable row level security;
alter table public.meals             enable row level security;

create policy households_rw on public.households for all to authenticated
  using (public.is_household_member(id)) with check (public.is_household_member(id));

do $$
declare t text;
begin
  foreach t in array array['members', 'events', 'daycare_pattern', 'daycare_overrides',
                           'chores', 'stores', 'grocery_items', 'store_stats', 'meals']
  loop
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (public.is_household_member(household_id))
         with check (public.is_household_member(household_id))',
      t || '_rw', t);
  end loop;
end $$;

create policy event_tags_rw on public.event_tags for all to authenticated
  using (exists (select 1 from public.events e
                 where e.id = event_id and public.is_household_member(e.household_id)))
  with check (exists (select 1 from public.events e
                      where e.id = event_id and public.is_household_member(e.household_id)));

create policy chore_completions_rw on public.chore_completions for all to authenticated
  using (exists (select 1 from public.chores c
                 where c.id = chore_id and public.is_household_member(c.household_id)))
  with check (exists (select 1 from public.chores c
                      where c.id = chore_id and public.is_household_member(c.household_id)));

-- Anyone signed in can read the barcode cache; only the edge function (service role) writes it.
create policy products_read on public.products for select to authenticated using (true);

grant execute on function public.unclaimed_adults(text) to authenticated;
grant execute on function public.claim_member(text, uuid) to authenticated;
grant execute on function public.record_store_trip(uuid, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: phones refresh when anything in the household changes
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.events, public.event_tags, public.daycare_overrides, public.chores,
      public.chore_completions, public.grocery_items, public.meals, public.members;
  end if;
end $$;
