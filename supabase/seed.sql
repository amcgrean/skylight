-- Family Hub — starter data for our household.
-- Run once in the Supabase SQL editor (or `supabase db reset` locally).
-- After running, note the invite code it prints; Aaron and Makala each sign in on
-- their phone, enter the code, and pick who they are.
-- Edit the two emails below first: tagged adults get Google Calendar invites there.

do $$
declare
  h uuid;
  aaron uuid; makala uuid; patrick uuid; pets uuid; jaypeggy uuid; ronautumn uuid;
  d smallint;
begin
  if exists (select 1 from public.households) then
    raise notice 'A household already exists — skipping seed.';
    return;
  end if;

  insert into public.households (name) values ('Home') returning id into h;

  insert into public.members (household_id, name, short_name, kind, color, email, sort)
    values (h, 'Aaron',  'Aaron',  'adult', '#5DB894', null /* 'aaron@…' */, 0) returning id into aaron;
  insert into public.members (household_id, name, short_name, kind, color, email, sort)
    values (h, 'Makala', 'Makala', 'adult', '#EE8FA8', null /* 'makala@…' */, 1) returning id into makala;
  insert into public.members (household_id, name, short_name, kind, color, sort)
    values (h, 'Patrick', 'Patrick', 'child', '#F2C14E', 2) returning id into patrick;
  insert into public.members (household_id, name, short_name, kind, color, sort)
    values (h, 'Pets', 'Pets', 'pets', '#6CC0CF', 3) returning id into pets;
  insert into public.members (household_id, name, short_name, kind, color, sort)
    values (h, 'Jay & Peggy', 'Jay/Peggy', 'grandparent', '#B4A3FF', 4) returning id into jaypeggy;
  insert into public.members (household_id, name, short_name, kind, color, sort)
    values (h, 'Ron & Autumn', 'Ron/Autumn', 'grandparent', '#A9C46C', 5) returning id into ronautumn;

  -- Aaron does mornings, Makala does evenings, Monday–Friday.
  for d in 1..5 loop
    insert into public.daycare_pattern (household_id, weekday, drop_member, pick_member)
    values (h, d, aaron, makala);
  end loop;

  insert into public.stores (household_id, name, color, sort) values
    (h, 'Hy-Vee', '#E07A5F', 0),
    (h, 'Costco', '#3F6FA8', 1),
    (h, 'Target', '#B83E61', 2),
    (h, 'Aldi',   '#F2C14E', 3);

  insert into public.chores (household_id, title, member_id, points, sort) values
    (h, 'Take out trash',   aaron,   2, 0),
    (h, 'Start laundry',    makala,  2, 1),
    (h, 'Toys in the bin',  patrick, 1, 2),
    (h, 'Brush teeth',      patrick, 1, 3),
    (h, 'Walk the dog',     pets,    2, 4),
    (h, 'Feed the dog',     pets,    1, 5),
    (h, 'Feed both cats',   pets,    1, 6),
    (h, 'Scoop litter box', pets,    2, 7);

  raise notice 'Household created. Invite code: %',
    (select invite_code from public.households where id = h);
end $$;

select name, invite_code from public.households;
