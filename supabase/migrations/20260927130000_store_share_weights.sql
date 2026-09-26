-- Keep the share counts behind a 'shares' split, so the app can show that
-- someone was "2 shares" and not just the resulting amount. Null for even and
-- custom splits.

alter table public.expense_splits
  add column share_weight numeric check (share_weight is null or share_weight > 0);

-- Add an expense and its splits atomically.
--   even:   p_participants = who shares it. Leftover cents go one each to the
--           first participants in the order given.
--   custom: p_shares[i] is what p_participants[i] owes; must sum to the amount.
--   shares: p_share_weights[i] is p_participants[i]'s weight (e.g. 2 for a
--           couple, 0.5 for a kid; > 0, at most 2 decimals). Each person gets
--           floor(amount * weight / total weight); the leftover cents (always
--           fewer than the number of participants) go one each to the first
--           participants, so the shares sum exactly to the amount. The
--           weights are stored on expense_splits.share_weight. To leave
--           someone out of a shares split, omit them from p_participants.
create or replace function public.add_expense(
  p_slug          text,
  p_paid_by       uuid,
  p_description   text,
  p_amount_cents  bigint,
  p_split_type    public.split_type,
  p_participants  uuid[],
  p_shares        bigint[] default null,
  p_share_weights numeric[] default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_group_id     uuid := private.group_id_for(p_slug, true);
  v_expense_id   uuid;
  v_n            int := coalesce(cardinality(p_participants), 0);
  v_shares       bigint[];
  v_weights      bigint[]; -- share weights in hundredths, so the math is exact integers
  v_total_weight bigint;
  v_leftover     bigint;
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
  if p_split_type <> 'custom' and p_shares is not null then
    raise exception 'Amounts are only given for custom splits' using errcode = 'P0001';
  end if;
  if p_split_type <> 'shares' and p_share_weights is not null then
    raise exception 'Share counts are only given for shares splits' using errcode = 'P0001';
  end if;

  if p_split_type = 'even' then
    select array_agg(p_amount_cents / v_n + case when i <= p_amount_cents % v_n then 1 else 0 end order by i)
      into v_shares
      from generate_series(1, v_n) i;

  elsif p_split_type = 'custom' then
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

  elsif p_split_type = 'shares' then
    if coalesce(cardinality(p_share_weights), 0) <> v_n then
      raise exception 'Each person in a shares split needs a share count' using errcode = 'P0001';
    end if;
    if exists (select 1 from unnest(p_share_weights) w
                where w is null or w = 'NaN' or w <= 0 or w > 1000 or w <> round(w, 2)) then
      raise exception 'Share counts must be positive numbers up to 1000, with at most 2 decimals'
        using errcode = 'P0001';
    end if;

    select array_agg((w * 100)::bigint order by i) into v_weights
      from unnest(p_share_weights) with ordinality as t(w, i);
    select sum(w) into v_total_weight from unnest(v_weights) w;

    -- bigint division truncates, i.e. floors for these non-negative values
    select array_agg(p_amount_cents * w / v_total_weight order by i) into v_shares
      from unnest(v_weights) with ordinality as t(w, i);

    v_leftover := p_amount_cents - (select sum(s) from unnest(v_shares) s);
    for i in 1 .. v_leftover loop
      v_shares[i] := v_shares[i] + 1;
    end loop;

  else
    raise exception 'Unknown split type %', p_split_type using errcode = 'P0001';
  end if;

  insert into public.expenses (group_id, paid_by, description, amount_cents, split_type)
    values (v_group_id, p_paid_by, btrim(p_description), p_amount_cents, p_split_type)
    returning id into v_expense_id;

  -- p_share_weights is null for even/custom, so share_weight is stored as null there
  insert into public.expense_splits (expense_id, group_id, person_id, share_cents, share_weight)
    select v_expense_id, v_group_id, t.person_id, t.share, t.weight
      from unnest(p_participants, v_shares, p_share_weights) as t(person_id, share, weight);

  return v_expense_id;
end $$;

create or replace function public.get_group(p_slug text) returns jsonb
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
                          'person_id',    s.person_id,
                          'share_cents',  s.share_cents,
                          'share_weight', s.share_weight))
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
