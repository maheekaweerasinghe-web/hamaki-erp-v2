-- Hamaki ERP - RM hardening phase 1
-- Apply this in Supabase SQL Editor BEFORE deploying the matching frontend.

begin;

alter table public.rm_movements
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by_user_id uuid,
  add column if not exists void_reason text,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by_user_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'rm_movements_voided_by_user_id_fkey'
      and conrelid = 'public.rm_movements'::regclass
  ) then
    alter table public.rm_movements
      add constraint rm_movements_voided_by_user_id_fkey
      foreign key (voided_by_user_id)
      references public.users(id)
      on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'rm_movements_updated_by_user_id_fkey'
      and conrelid = 'public.rm_movements'::regclass
  ) then
    alter table public.rm_movements
      add constraint rm_movements_updated_by_user_id_fkey
      foreign key (updated_by_user_id)
      references public.users(id)
      on delete set null;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'rm_movements_purchase_vendor_required'
      and conrelid = 'public.rm_movements'::regclass
  ) then
    alter table public.rm_movements
      add constraint rm_movements_purchase_vendor_required
      check (movement_type <> 'PURCHASE' or vendor_id is not null)
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'rm_movements_void_audit_complete'
      and conrelid = 'public.rm_movements'::regclass
  ) then
    alter table public.rm_movements
      add constraint rm_movements_void_audit_complete
      check (
        voided_at is null
        or (
          voided_by_user_id is not null
          and void_reason is not null
          and length(trim(void_reason)) >= 3
        )
      )
      not valid;
  end if;
end
$$;

create index if not exists idx_rm_movements_material_active_date
  on public.rm_movements (rm_material_id, movement_date, created_at, id)
  where voided_at is null;

create index if not exists idx_rm_movements_vendor_active_purchase
  on public.rm_movements (vendor_id, movement_date)
  where voided_at is null and movement_type = 'PURCHASE';

drop trigger if exists trg_rm_movements_updated_at on public.rm_movements;
create trigger trg_rm_movements_updated_at
before update on public.rm_movements
for each row execute function public.set_updated_at();

create or replace view public.v_rm_balance as
with ordered as (
  select
    rmv.id,
    rmv.rm_material_id,
    rmv.movement_date,
    rmv.created_at,
    rmv.qty_in,
    rmv.qty_out,
    rmv.unit_cost,
    rmv.line_value,
    sum(coalesce(rmv.qty_in, 0) - coalesce(rmv.qty_out, 0))
      over (
        partition by rmv.rm_material_id
        order by rmv.movement_date, rmv.created_at, rmv.id
        rows between unbounded preceding and current row
      ) as running_stock,
    row_number()
      over (
        partition by rmv.rm_material_id
        order by rmv.movement_date, rmv.created_at, rmv.id
      ) as seq_no
  from public.rm_movements rmv
  where rmv.voided_at is null
),
last_reset as (
  select ordered.rm_material_id, max(ordered.seq_no) as last_reset_seq
  from ordered
  where ordered.running_stock <= 0
  group by ordered.rm_material_id
),
active_cycle as (
  select o.*
  from ordered o
  left join last_reset r on r.rm_material_id = o.rm_material_id
  where r.last_reset_seq is null or o.seq_no > r.last_reset_seq
)
select
  rm.id as rm_material_id,
  rm.material_code,
  rm.material_name,
  rm.variant,
  rm.unit,
  rm.reorder_level,
  coalesce(sum(ac.qty_in), 0) as total_in,
  coalesce(sum(ac.qty_out), 0) as total_out,
  coalesce(sum(ac.qty_in - ac.qty_out), 0) as stock_on_hand,
  case
    when coalesce(sum(case when ac.qty_in > 0 then ac.qty_in else 0 end), 0) > 0
      then round(
        coalesce(sum(case when ac.qty_in > 0 then ac.line_value else 0 end), 0)
        / nullif(sum(case when ac.qty_in > 0 then ac.qty_in else 0 end), 0),
        2
      )
    else 0
  end as weighted_avg_cost,
  round(
    coalesce(sum(case when ac.qty_in > 0 then ac.line_value else 0 end), 0)
    - coalesce(sum(case when ac.qty_out > 0 then ac.line_value else 0 end), 0),
    2
  ) as stock_value,
  case
    when coalesce(sum(ac.qty_in - ac.qty_out), 0) <= 0 then 'OUT'
    when rm.reorder_level > 0
      and coalesce(sum(ac.qty_in - ac.qty_out), 0) <= rm.reorder_level then 'LOW'
    else 'OK'
  end as status
from public.rm_materials rm
left join active_cycle ac on ac.rm_material_id = rm.id
group by rm.id, rm.material_code, rm.material_name, rm.variant, rm.unit, rm.reorder_level;

create or replace view public.v_supplier_payables as
with settings as (
  select banking_settings.system_start_date
  from public.banking_settings
  where banking_settings.id = 1
),
opening as (
  select supplier_opening_payables.vendor_id,
         sum(supplier_opening_payables.opening_amount) as opening_amount
  from public.supplier_opening_payables
  group by supplier_opening_payables.vendor_id
),
purchases as (
  select m.vendor_id,
         sum(coalesce(m.line_value, 0)) as purchases_since_start
  from public.rm_movements m, settings s
  where m.movement_type = 'PURCHASE'
    and m.voided_at is null
    and m.vendor_id is not null
    and s.system_start_date is not null
    and m.movement_date >= s.system_start_date
  group by m.vendor_id
),
payments as (
  select t.vendor_id,
         sum(t.amount) as payments_since_start
  from public.bank_transactions t, settings s
  where t.voided_at is null
    and t.category = 'SUPPLIER_PAYMENT'
    and t.direction = 'OUT'
    and t.business = 'HAMAKI'
    and t.vendor_id is not null
    and s.system_start_date is not null
    and t.txn_date >= s.system_start_date
  group by t.vendor_id
)
select
  v.id as vendor_id,
  v.vendor_code,
  v.vendor_name,
  coalesce(o.opening_amount, 0) as opening_payable,
  coalesce(p.purchases_since_start, 0) as purchases_since_start,
  coalesce(py.payments_since_start, 0) as payments_since_start,
  coalesce(o.opening_amount, 0)
    + coalesce(p.purchases_since_start, 0)
    - coalesce(py.payments_since_start, 0) as outstanding
from public.rm_vendors v
left join opening o on o.vendor_id = v.id
left join purchases p on p.vendor_id = v.id
left join payments py on py.vendor_id = v.id;

create or replace function public.rm_current_operator_id()
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid;
begin
  select u.id
  into v_user_id
  from public.users u
  where u.auth_user_id = auth.uid()
    and u.is_active = true
    and u.role in ('ADMIN', 'ACCOUNTANT')
  limit 1;

  if v_user_id is null then
    raise exception 'You are not authorised to manage RM movements.';
  end if;

  return v_user_id;
end;
$$;

revoke all on function public.rm_current_operator_id() from public;
revoke all on function public.rm_current_operator_id() from authenticated;

create or replace function public.recalculate_rm_material_costs(p_rm_material_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_qty numeric := 0;
  v_value numeric := 0;
  v_wac numeric := 0;
  v_line_value numeric := 0;
begin
  if not exists (select 1 from public.rm_materials where id = p_rm_material_id) then
    raise exception 'RM material not found.';
  end if;

  for r in
    select id, movement_type, qty_in, qty_out, unit_cost, movement_date, created_at
    from public.rm_movements
    where rm_material_id = p_rm_material_id
      and voided_at is null
    order by movement_date, created_at, id
  loop
    if r.movement_type = 'PURCHASE' then
      if coalesce(r.qty_in, 0) <= 0 then
        raise exception 'Invalid purchase quantity in RM movement %.', r.id;
      end if;
      if coalesce(r.unit_cost, 0) <= 0 then
        raise exception 'Invalid purchase unit cost in RM movement %.', r.id;
      end if;

      v_line_value := round(r.qty_in * r.unit_cost, 2);

      update public.rm_movements
      set line_value = v_line_value
      where id = r.id
        and line_value is distinct from v_line_value;

      v_qty := v_qty + r.qty_in;
      v_value := v_value + v_line_value;

    elsif r.movement_type = 'ISSUE' then
      if coalesce(r.qty_out, 0) <= 0 then
        raise exception 'Invalid issue quantity in RM movement %.', r.id;
      end if;
      if r.qty_out > v_qty then
        raise exception
          'Cannot recalculate RM history: movement % issues % but only % was available at that point.',
          r.id, r.qty_out, v_qty;
      end if;
      if v_qty <= 0 then
        raise exception 'Cannot cost RM issue % because stock was zero.', r.id;
      end if;

      v_wac := v_value / v_qty;
      v_line_value := round(r.qty_out * v_wac, 2);

      update public.rm_movements
      set unit_cost = round(v_wac, 4),
          line_value = v_line_value
      where id = r.id
        and (
          unit_cost is distinct from round(v_wac, 4)
          or line_value is distinct from v_line_value
        );

      v_qty := v_qty - r.qty_out;
      v_value := v_value - v_line_value;

      if abs(v_qty) < 0.000001 then
        v_qty := 0;
        v_value := 0;
      end if;
    end if;
  end loop;
end;
$$;

revoke all on function public.recalculate_rm_material_costs(uuid) from public;
revoke all on function public.recalculate_rm_material_costs(uuid) from authenticated;

create or replace function public.rm_prepare_movement_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_unit text;
  v_stock numeric := 0;
  v_wac numeric := 0;
begin
  select m.unit
  into v_unit
  from public.rm_materials m
  where m.id = new.rm_material_id
    and m.status = 'ACTIVE';

  if not found then
    raise exception 'Active RM material not found.';
  end if;

  new.unit := v_unit;

  if new.movement_type = 'PURCHASE' then
    if new.vendor_id is null then
      raise exception 'Vendor is required for an RM purchase.';
    end if;
    if coalesce(new.qty_in, 0) <= 0 or coalesce(new.qty_out, 0) <> 0 then
      raise exception 'Invalid RM purchase quantity.';
    end if;
    if coalesce(new.unit_cost, 0) <= 0 then
      raise exception 'Unit cost must be greater than zero for an RM purchase.';
    end if;
    new.line_value := round(new.qty_in * new.unit_cost, 2);

  elsif new.movement_type = 'ISSUE' then
    if coalesce(new.qty_out, 0) <= 0 or coalesce(new.qty_in, 0) <> 0 then
      raise exception 'Invalid RM issue quantity.';
    end if;

    select coalesce(b.stock_on_hand, 0), coalesce(b.weighted_avg_cost, 0)
    into v_stock, v_wac
    from public.v_rm_balance b
    where b.rm_material_id = new.rm_material_id;

    if new.qty_out > v_stock then
      raise exception 'Insufficient RM stock. Available: %, requested: %.', v_stock, new.qty_out;
    end if;
    if v_wac <= 0 then
      raise exception 'RM issue cannot be costed because weighted average cost is zero.';
    end if;

    new.vendor_id := null;
    new.unit_cost := round(v_wac, 4);
    new.line_value := round(new.qty_out * v_wac, 2);
  else
    raise exception 'Invalid RM movement type.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_rm_prepare_movement_insert on public.rm_movements;
create trigger trg_rm_prepare_movement_insert
before insert on public.rm_movements
for each row execute function public.rm_prepare_movement_insert();

create or replace function public.rm_recalculate_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.recalculate_rm_material_costs(new.rm_material_id);
  return new;
end;
$$;

drop trigger if exists trg_rm_recalculate_after_insert on public.rm_movements;
create trigger trg_rm_recalculate_after_insert
after insert on public.rm_movements
for each row execute function public.rm_recalculate_after_insert();

create or replace function public.create_rm_movement(
  p_movement_date timestamptz,
  p_movement_type text,
  p_rm_material_id uuid,
  p_qty numeric,
  p_vendor_id uuid default null,
  p_unit_cost numeric default null,
  p_note text default null,
  p_reference text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_id uuid;
begin
  v_user_id := public.rm_current_operator_id();

  if p_movement_type not in ('PURCHASE', 'ISSUE') then
    raise exception 'Invalid RM movement type.';
  end if;
  if coalesce(p_qty, 0) <= 0 then
    raise exception 'Quantity must be greater than zero.';
  end if;

  insert into public.rm_movements (
    movement_date, movement_type, rm_material_id, vendor_id,
    qty_in, qty_out, unit_cost, line_value,
    note, reference, entered_by_user_id, updated_by_user_id
  )
  values (
    p_movement_date,
    p_movement_type,
    p_rm_material_id,
    case when p_movement_type = 'PURCHASE' then p_vendor_id else null end,
    case when p_movement_type = 'PURCHASE' then p_qty else 0 end,
    case when p_movement_type = 'ISSUE' then p_qty else 0 end,
    case when p_movement_type = 'PURCHASE' then coalesce(p_unit_cost, 0) else 0 end,
    0,
    nullif(trim(p_note), ''),
    nullif(trim(p_reference), ''),
    v_user_id,
    v_user_id
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.create_rm_movement(
  timestamptz, text, uuid, numeric, uuid, numeric, text, text
) from public;
grant execute on function public.create_rm_movement(
  timestamptz, text, uuid, numeric, uuid, numeric, text, text
) to authenticated;

create or replace function public.void_rm_movement(p_movement_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_material_id uuid;
  v_voided_at timestamptz;
begin
  v_user_id := public.rm_current_operator_id();

  if p_reason is null or length(trim(p_reason)) < 3 then
    raise exception 'Void reason must contain at least 3 characters.';
  end if;

  select rm_material_id, voided_at
  into v_material_id, v_voided_at
  from public.rm_movements
  where id = p_movement_id
  for update;

  if not found then
    raise exception 'RM movement not found.';
  end if;
  if v_voided_at is not null then
    raise exception 'RM movement is already voided.';
  end if;

  update public.rm_movements
  set voided_at = now(),
      voided_by_user_id = v_user_id,
      void_reason = trim(p_reason),
      updated_by_user_id = v_user_id
  where id = p_movement_id;

  perform public.recalculate_rm_material_costs(v_material_id);
end;
$$;

revoke all on function public.void_rm_movement(uuid, text) from public;
grant execute on function public.void_rm_movement(uuid, text) to authenticated;

commit;
