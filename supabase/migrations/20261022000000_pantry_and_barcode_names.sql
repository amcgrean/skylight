-- Family Hub — pantry, and barcodes the household has named itself.

-- ---------------------------------------------------------------------------
-- Names the family typed for barcodes (store brands like Aldi's that no public
-- database knows, or a better name than the database's). Checked before the
-- upc-lookup function, so each barcode only ever needs naming once.
-- ---------------------------------------------------------------------------
create table public.household_products (
  household_id  uuid not null references public.households on delete cascade,
  upc           text not null,
  name          text not null check (length(trim(name)) > 0),
  updated_by    uuid references public.members on delete set null,
  updated_at    timestamptz not null default now(),
  primary key (household_id, upc)
);

-- ---------------------------------------------------------------------------
-- Pantry: what's on hand at home. One row per product; scanning it again adds one.
-- ---------------------------------------------------------------------------
create table public.pantry_items (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households on delete cascade,
  name          text not null check (length(trim(name)) > 0),
  product_key   text not null,          -- same key as grocery_items: "upc:<code>" or the normalized name
  upc           text,
  quantity      int not null default 1 check (quantity >= 0),
  added_by      uuid references public.members on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (household_id, product_key)
);

create trigger pantry_items_touch before update on public.pantry_items
  for each row execute function public.touch_updated_at();
create trigger household_products_touch before update on public.household_products
  for each row execute function public.touch_updated_at();

-- Adds (or removes, with a negative delta) units of a product in one statement, so two
-- phones scanning at once both count. Creates the row on first add; never goes below 0.
create or replace function public.adjust_pantry(
  p_household uuid, p_product_key text, p_name text, p_upc text, p_delta int, p_member uuid
)
returns public.pantry_items
language plpgsql security invoker set search_path = public
as $$
declare
  v_item public.pantry_items;
begin
  insert into public.pantry_items (household_id, name, product_key, upc, quantity, added_by)
  values (p_household, trim(p_name), p_product_key, p_upc, greatest(p_delta, 0), p_member)
  on conflict (household_id, product_key)
  do update set quantity = greatest(public.pantry_items.quantity + p_delta, 0)
  returning * into v_item;
  return v_item;
end $$;

grant execute on function public.adjust_pantry(uuid, text, text, text, int, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Row-level security and realtime, same rules as everything else
-- ---------------------------------------------------------------------------
alter table public.household_products enable row level security;
alter table public.pantry_items       enable row level security;

create policy household_products_rw on public.household_products for all to authenticated
  using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy pantry_items_rw on public.pantry_items for all to authenticated
  using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.household_products, public.pantry_items;
  end if;
end $$;

-- The old lookup cached timeouts and rate limits as "not found" for 14 days.
-- Forget those so every barcode gets a fresh lookup with the new sources.
delete from public.products where found = false;
