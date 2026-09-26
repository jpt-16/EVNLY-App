-- EVNLY initial schema
--
-- Access model: there is no login. A group's `slug` is the capability — anyone
-- holding the link can view and edit that split. Tables are locked down (RLS on,
-- no policies, no grants to anon/authenticated); all access goes through the
-- SECURITY DEFINER functions at the bottom of this file, each of which takes the
-- slug and scopes every read/write to that one group.

create extension if not exists pgcrypto with schema extensions;

-- Internal helpers live here; this schema is not exposed through the API.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

create type public.split_type as enum ('even', 'custom');
create type public.settlement_method as enum ('manual', 'venmo', 'cashapp', 'other');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.groups (
  id                 uuid primary key default gen_random_uuid(),
  slug               text not null unique check (slug ~ '^[A-Za-z0-9]{12}$'),
  name               text not null check (char_length(btrim(name)) between 1 and 80),
  currency           char(3) not null default 'USD',
  archive_after_days int not null default 14 check (archive_after_days between 1 and 365),
  last_activity_at   timestamptz not null default now(),
  created_at         timestamptz not null default now()
);

create table public.people (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.groups (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 40),
  is_organizer boolean not null default false,
  claimed_at   timestamptz,
  -- clock_timestamp so people inserted in one transaction keep their order
  created_at   timestamptz not null default clock_timestamp(),
  -- target for composite FKs that guarantee rows reference people in the same group
  unique (group_id, id)
);
create unique index people_group_name_key on public.people (group_id, lower(btrim(display_name)));
create unique index people_one_organizer_key on public.people (group_id) where is_organizer;

create table public.expenses (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.groups (id) on delete cascade,
  paid_by      uuid not null,
  description  text not null check (char_length(btrim(description)) between 1 and 120),
  amount_cents bigint not null check (amount_cents > 0 and amount_cents <= 100000000),
  split_type   public.split_type not null,
  created_at   timestamptz not null default clock_timestamp(),
  unique (group_id, id),
  foreign key (group_id, paid_by) references public.people (group_id, id)
);
create index expenses_group_created_idx on public.expenses (group_id, created_at desc);
create index expenses_paid_by_idx on public.expenses (group_id, paid_by);

create table public.expense_splits (
  expense_id  uuid not null,
  group_id    uuid not null,
  person_id   uuid not null,
  share_cents bigint not null check (share_cents >= 0),
  primary key (expense_id, person_id),
  foreign key (group_id, expense_id) references public.expenses (group_id, id) on delete cascade,
  foreign key (group_id, person_id) references public.people (group_id, id)
);
create index expense_splits_person_idx on public.expense_splits (group_id, person_id);
create index expense_splits_expense_idx on public.expense_splits (group_id, expense_id);

create table public.settlements (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.groups (id) on delete cascade,
  from_person  uuid not null,
  to_person    uuid not null,
  amount_cents bigint not null check (amount_cents > 0 and amount_cents <= 100000000),
  method       public.settlement_method not null default 'manual',
  external_ref text, -- reserved for Venmo / Cash App transaction ids
  created_at   timestamptz not null default clock_timestamp(),
  check (from_person <> to_person),
  foreign key (group_id, from_person) references public.people (group_id, id),
  foreign key (group_id, to_person) references public.people (group_id, id)
);
create index settlements_group_created_idx on public.settlements (group_id, created_at desc);
create index settlements_from_idx on public.settlements (group_id, from_person);
create index settlements_to_idx on public.settlements (group_id, to_person);

-- ---------------------------------------------------------------------------
-- Lock tables down: no direct access for API roles
-- ---------------------------------------------------------------------------

alter table public.groups         enable row level security;
alter table public.people         enable row level security;
alter table public.expenses       enable row level security;
alter table public.expense_splits enable row level security;
alter table public.settlements    enable row level security;

revoke all on public.groups, public.people, public.expenses, public.expense_splits, public.settlements
  from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Integrity triggers
-- ---------------------------------------------------------------------------

-- Splits must add up exactly to the expense amount. Deferred so an expense and
-- its splits can be inserted in either order within one transaction.
create function private.assert_split_sum(p_expense_id uuid) returns void
language plpgsql set search_path = '' as $$
declare
  v_amount bigint;
  v_sum    bigint;
begin
  select amount_cents into v_amount from public.expenses where id = p_expense_id;
  if not found then
    return; -- expense was deleted; its splits cascade with it
  end if;
  select coalesce(sum(share_cents), 0) into v_sum
    from public.expense_splits where expense_id = p_expense_id;
  if v_sum <> v_amount then
    raise exception 'Splits (%) do not add up to the expense amount (%)', v_sum, v_amount
      using errcode = 'check_violation';
  end if;
end $$;

create function private.expense_splits_sum_trigger() returns trigger
language plpgsql set search_path = '' as $$
begin
  perform private.assert_split_sum(coalesce(new.expense_id, old.expense_id));
  return null;
end $$;

create function private.expenses_sum_trigger() returns trigger
language plpgsql set search_path = '' as $$
begin
  perform private.assert_split_sum(new.id);
  return null;
end $$;

create constraint trigger expense_splits_sum_check
  after insert or update or delete on public.expense_splits
  deferrable initially deferred
  for each row execute function private.expense_splits_sum_trigger();

create constraint trigger expenses_sum_check
  after insert or update of amount_cents on public.expenses
  deferrable initially deferred
  for each row execute function private.expenses_sum_trigger();

-- Adding an expense resets the auto-archive clock.
create function private.bump_group_activity() returns trigger
language plpgsql set search_path = '' as $$
begin
  update public.groups set last_activity_at = now() where id = new.group_id;
  return null;
end $$;

create trigger expenses_bump_activity
  after insert on public.expenses
  for each row execute function private.bump_group_activity();

-- ---------------------------------------------------------------------------
-- Private helpers
-- ---------------------------------------------------------------------------

-- 12 random base62 characters (~71 bits). Unguessable; it is the access key.
create function private.new_slug() returns text
language plpgsql set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  bytes  bytea := extensions.gen_random_bytes(12);
  result text := '';
begin
  for i in 0..11 loop
    result := result || substr(alphabet, (get_byte(bytes, i) % 62) + 1, 1);
  end loop;
  return result;
end $$;

create function private.is_archived(g public.groups) returns boolean
language sql stable set search_path = '' as $$
  select now() > g.last_activity_at + make_interval(days => g.archive_after_days);
$$;

-- Resolve a slug to a group id, or raise.
create function private.group_id_for(p_slug text, p_for_write boolean) returns uuid
language plpgsql stable set search_path = '' as $$
declare
  g public.groups;
begin
  select * into g from public.groups where slug = p_slug;
  if not found then
    raise exception 'Split not found' using errcode = 'P0002';
  end if;
  if p_for_write and private.is_archived(g) then
    raise exception 'This split is archived and can no longer be changed' using errcode = 'P0001';
  end if;
  return g.id;
end $$;

-- ---------------------------------------------------------------------------
-- Public API (called via supabase.rpc)
-- ---------------------------------------------------------------------------

-- Create a group with its organizer and any other names. Returns {slug, person_id}
-- where person_id is the organizer (the creating device's identity).
create function public.create_group(
  p_name           text,
  p_organizer_name text,
  p_other_names    text[] default '{}'
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_group_id  uuid;
  v_slug      text;
  v_person_id uuid;
begin
  loop
    begin
      v_slug := private.new_slug();
      insert into public.groups (slug, name) values (v_slug, btrim(p_name))
        returning id into v_group_id;
      exit;
    exception when unique_violation then
      -- slug collision (astronomically unlikely); try again
    end;
  end loop;

  insert into public.people (group_id, display_name, is_organizer, claimed_at)
    values (v_group_id, btrim(p_organizer_name), true, now())
    returning id into v_person_id;

  insert into public.people (group_id, display_name)
    select v_group_id, btrim(n)
      from unnest(coalesce(p_other_names, '{}')) with ordinality as t(n, ord)
     where btrim(n) <> ''
     order by ord;

  return jsonb_build_object('slug', v_slug, 'person_id', v_person_id);
exception when unique_violation then
  raise exception 'Each person in a split needs a different name' using errcode = 'P0001';
end $$;

-- Full snapshot of a group: people, expenses (with splits), settlements and
-- pairwise balances. Returns null if the slug doesn't exist.
--
-- balances: one row per pair of people with a non-zero net debt,
-- {from_person, to_person, amount_cents} meaning from_person owes to_person.
create function public.get_group(p_slug text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id',                 g.id,
    'slug',               g.slug,
    'name',               g.name,
    'currency',           g.currency,
    'archive_after_days', g.archive_after_days,
    'last_activity_at',   g.last_activity_at,
    'archives_at',        g.last_activity_at + make_interval(days => g.archive_after_days),
    'is_archived',        private.is_archived(g),
    'created_at',         g.created_at,
    'people', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id',           p.id,
               'display_name', p.display_name,
               'is_organizer', p.is_organizer,
               'claimed',      p.claimed_at is not null
             ) order by p.is_organizer desc, p.created_at)
        from public.people p
       where p.group_id = g.id
    ), '[]'::jsonb),
    'expenses', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id',           e.id,
               'paid_by',      e.paid_by,
               'description',  e.description,
               'amount_cents', e.amount_cents,
               'split_type',   e.split_type,
               'created_at',   e.created_at,
               'splits', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'person_id',   s.person_id,
                          'share_cents', s.share_cents))
                   from public.expense_splits s
                  where s.expense_id = e.id
               ), '[]'::jsonb)
             ) order by e.created_at desc)
        from public.expenses e
       where e.group_id = g.id
    ), '[]'::jsonb),
    'settlements', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id',           st.id,
               'from_person',  st.from_person,
               'to_person',    st.to_person,
               'amount_cents', st.amount_cents,
               'method',       st.method,
               'created_at',   st.created_at
             ) order by st.created_at desc)
        from public.settlements st
       where st.group_id = g.id
    ), '[]'::jsonb),
    'balances', coalesce((
      with edges as (
        -- each split share owed to the payer (payer's own share owes nobody)
        select s.person_id as debtor, e.paid_by as creditor, s.share_cents as amount
          from public.expense_splits s
          join public.expenses e on e.id = s.expense_id
         where e.group_id = g.id and s.person_id <> e.paid_by and s.share_cents > 0
        union all
        -- a payment from A to B cancels that much of A's debt to B
        select st.to_person, st.from_person, st.amount_cents
          from public.settlements st
         where st.group_id = g.id
      ),
      pairs as (
        select least(debtor, creditor)    as a,
               greatest(debtor, creditor) as b,
               sum(case when debtor = least(debtor, creditor) then amount else -amount end) as net
          from edges
         group by 1, 2
      )
      select jsonb_agg(jsonb_build_object(
               'from_person',  case when net > 0 then a else b end,
               'to_person',    case when net > 0 then b else a end,
               'amount_cents', abs(net)))
        from pairs
       where net <> 0
    ), '[]'::jsonb)
  )
  from public.groups g
  where g.slug = p_slug;
$$;

create function public.add_person(p_slug text, p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_group_id  uuid := private.group_id_for(p_slug, true);
  v_person_id uuid;
begin
  insert into public.people (group_id, display_name)
    values (v_group_id, btrim(p_name))
    returning id into v_person_id;
  return v_person_id;
exception when unique_violation then
  raise exception 'Someone in this split already has that name' using errcode = 'P0001';
end $$;

-- "I'm Maya" — records that the spot has been claimed. Identity itself is kept
-- on the device; this is informational only.
create function public.claim_person(p_slug text, p_person_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_group_id uuid := private.group_id_for(p_slug, false);
begin
  update public.people
     set claimed_at = coalesce(claimed_at, now())
   where id = p_person_id and group_id = v_group_id;
  if not found then
    raise exception 'That person is not in this split' using errcode = 'P0002';
  end if;
end $$;

-- Add an expense and its splits atomically.
--   even:   p_participants = who shares it; p_shares must be null. Leftover cents
--           go one each to the first participants in the order given.
--   custom: p_shares[i] is what p_participants[i] owes; must sum to the amount.
create function public.add_expense(
  p_slug         text,
  p_paid_by      uuid,
  p_description  text,
  p_amount_cents bigint,
  p_split_type   public.split_type,
  p_participants uuid[],
  p_shares       bigint[] default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_group_id   uuid := private.group_id_for(p_slug, true);
  v_expense_id uuid;
  v_n          int := coalesce(cardinality(p_participants), 0);
  v_shares     bigint[];
begin
  if v_n = 0 then
    raise exception 'Pick at least one person to split with' using errcode = 'P0001';
  end if;
  if (select count(distinct x) from unnest(p_participants) x) <> v_n then
    raise exception 'A person appears in the split more than once' using errcode = 'P0001';
  end if;
  if (select count(*) from public.people
       where group_id = v_group_id and id = any (p_participants)) <> v_n then
    raise exception 'Everyone in the split must be part of this group' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.people where group_id = v_group_id and id = p_paid_by) then
    raise exception 'The payer must be part of this group' using errcode = 'P0001';
  end if;

  if p_split_type = 'even' then
    if p_shares is not null then
      raise exception 'Even splits are calculated automatically' using errcode = 'P0001';
    end if;
    select array_agg(p_amount_cents / v_n + case when i <= p_amount_cents % v_n then 1 else 0 end order by i)
      into v_shares
      from generate_series(1, v_n) i;
  else
    if coalesce(cardinality(p_shares), 0) <> v_n then
      raise exception 'Each person in a custom split needs an amount' using errcode = 'P0001';
    end if;
    if exists (select 1 from unnest(p_shares) s where s is null or s < 0) then
      raise exception 'Amounts can''t be negative' using errcode = 'P0001';
    end if;
    if (select sum(s) from unnest(p_shares) s) <> p_amount_cents then
      raise exception 'Custom amounts must add up to the total' using errcode = 'P0001';
    end if;
    v_shares := p_shares;
  end if;

  insert into public.expenses (group_id, paid_by, description, amount_cents, split_type)
    values (v_group_id, p_paid_by, btrim(p_description), p_amount_cents, p_split_type)
    returning id into v_expense_id;

  insert into public.expense_splits (expense_id, group_id, person_id, share_cents)
    select v_expense_id, v_group_id, t.person_id, t.share
      from unnest(p_participants, v_shares) as t(person_id, share);

  return v_expense_id;
end $$;

-- Manual "mark as settled": p_from paid p_to this amount outside the app.
create function public.record_settlement(
  p_slug         text,
  p_from         uuid,
  p_to           uuid,
  p_amount_cents bigint,
  p_method       public.settlement_method default 'manual'
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_group_id uuid := private.group_id_for(p_slug, true);
  v_id       uuid;
begin
  if (select count(*) from public.people
       where group_id = v_group_id and id in (p_from, p_to)) <> 2 then
    raise exception 'Both people must be part of this group' using errcode = 'P0001';
  end if;
  insert into public.settlements (group_id, from_person, to_person, amount_cents, method)
    values (v_group_id, p_from, p_to, p_amount_cents, p_method)
    returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------

revoke all on all functions in schema private from public, anon, authenticated;

revoke all on function public.create_group(text, text, text[]) from public, anon, authenticated;
revoke all on function public.get_group(text) from public, anon, authenticated;
revoke all on function public.add_person(text, text) from public, anon, authenticated;
revoke all on function public.claim_person(text, uuid) from public, anon, authenticated;
revoke all on function public.add_expense(text, uuid, text, bigint, public.split_type, uuid[], bigint[]) from public, anon, authenticated;
revoke all on function public.record_settlement(text, uuid, uuid, bigint, public.settlement_method) from public, anon, authenticated;

grant execute on function public.create_group(text, text, text[]) to anon, authenticated;
grant execute on function public.get_group(text) to anon, authenticated;
grant execute on function public.add_person(text, text) to anon, authenticated;
grant execute on function public.claim_person(text, uuid) to anon, authenticated;
grant execute on function public.add_expense(text, uuid, text, bigint, public.split_type, uuid[], bigint[]) to anon, authenticated;
grant execute on function public.record_settlement(text, uuid, uuid, bigint, public.settlement_method) to anon, authenticated;
