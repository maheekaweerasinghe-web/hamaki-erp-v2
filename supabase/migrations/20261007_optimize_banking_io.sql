-- Hamaki ERP Banking performance optimization
-- Preserves current accounting rules while removing repeated scans and schema discovery.
-- Safe to run while the ERP is live.

begin;

-- 1) Index the active banking ledger path used by book balances.
create index if not exists idx_bank_transactions_active_account_date
  on public.bank_transactions (account_id, txn_date)
  where voided_at is null;

create index if not exists idx_bank_reconciliations_account_latest
  on public.bank_reconciliations (account_id, reconciliation_date desc, created_at desc);

create index if not exists idx_bank_transactions_cod_settlement_active
  on public.bank_transactions (txn_date)
  where voided_at is null
    and category = 'COD_SETTLEMENT'
    and business = 'HAMAKI';

create index if not exists idx_cod_adjustments_date
  on public.cod_adjustments (adjustment_date);

create index if not exists idx_orders_cod_dispatched
  on public.orders (dispatched_at, order_no)
  where dispatched_at is not null
    and upper(trim(coalesce(transaction_type::text, ''))) = 'COD';

-- 2) Calculate every account balance in one grouped pass instead of calling
--    bank_book_balance() once per account.
create or replace view public.v_bank_account_position as
with txn_totals as (
  select
    a.id as account_id,
    coalesce(sum(
      case
        when t.direction = 'IN' then t.amount
        when t.direction = 'OUT' then -t.amount
        else 0
      end
    ), 0) as net_movement
  from public.bank_accounts a
  left join public.bank_transactions t
    on t.account_id = a.id
   and t.voided_at is null
   and t.txn_date >= a.opening_date
   and t.txn_date <= current_date
  group by a.id
),
latest_recon as (
  select account_id, reconciliation_date, actual_balance, book_balance, difference
  from (
    select
      r.account_id,
      r.reconciliation_date,
      r.actual_balance,
      r.book_balance,
      r.difference,
      row_number() over (
        partition by r.account_id
        order by r.reconciliation_date desc, r.created_at desc
      ) as rn
    from public.bank_reconciliations r
  ) ranked
  where rn = 1
)
select
  a.id,
  a.account_name,
  a.bank_name,
  a.account_type,
  a.usage_tag,
  a.is_virtual,
  a.opening_date,
  a.opening_balance,
  a.opening_hamaki_amount,
  a.opening_teesupp_amount,
  a.opening_personal_amount,
  a.notes,
  a.is_active,
  a.closed_at,
  a.created_at,
  a.created_by_auth,
  a.updated_at,
  coalesce(a.opening_balance, 0) + coalesce(tt.net_movement, 0) as book_balance,
  lr.reconciliation_date as last_reconciliation_date,
  lr.actual_balance as last_actual_balance,
  lr.book_balance as last_reconciled_book_balance,
  lr.difference as last_difference
from public.bank_accounts a
left join txn_totals tt on tt.account_id = a.id
left join latest_recon lr on lr.account_id = a.id;

-- 3) Orders are now a known stable table. Remove repeated information_schema
--    discovery and dynamic SQL from COD dispatched calculation.
create or replace function public.banking_cod_dispatched_total(
  p_as_at date default current_date
)
returns numeric
language sql
stable
security definer
set search_path to 'public'
as $function$
  with settings as (
    select system_start_date
    from public.banking_settings
    where id = 1
  ),
  per_order as (
    select
      o.order_no,
      max(
        greatest(
          coalesce(o.balance, 0)::numeric
          - coalesce(o.delivery_charge, 0)::numeric,
          0
        )
      ) as cod_value
    from public.orders o
    cross join settings s
    where s.system_start_date is not null
      and upper(trim(coalesce(o.transaction_type::text, ''))) = 'COD'
      and o.dispatched_at is not null
      and o.dispatched_at::date >= s.system_start_date
      and o.dispatched_at::date <= p_as_at
    group by o.order_no
  )
  select coalesce(sum(cod_value), 0)::numeric
  from per_order;
$function$;

-- 4) Read Banking settings once when calculating COD receivable.
--    Return calculation is intentionally left unchanged to preserve its
--    existing accounting source until Financials is optimized separately.
create or replace function public.banking_cod_receivable()
returns numeric
language sql
stable
security definer
set search_path to 'public'
as $function$
  with s as (
    select
      system_start_date,
      coalesce(opening_cod_receivable, 0)::numeric as opening
    from public.banking_settings
    where id = 1
  ),
  settlements as (
    select coalesce(sum(coalesce(t.cod_cleared_amount, t.amount)), 0)::numeric as total
    from public.bank_transactions t
    cross join s
    where s.system_start_date is not null
      and t.voided_at is null
      and t.category = 'COD_SETTLEMENT'
      and t.business = 'HAMAKI'
      and t.txn_date >= s.system_start_date
  ),
  adj as (
    select coalesce(sum(c.amount), 0)::numeric as total
    from public.cod_adjustments c
    cross join s
    where s.system_start_date is not null
      and c.adjustment_date >= s.system_start_date
  )
  select
    coalesce((select opening from s), 0)
    + public.banking_cod_dispatched_total(current_date)
    - public.banking_cod_return_total()
    - coalesce((select total from settlements), 0)
    + coalesce((select total from adj), 0);
$function$;

-- 5) The production ERP now has a fixed orders source. Avoid querying
--    information_schema on every Banking page load.
create or replace function public.banking_cod_source_status()
returns table(source_table text, detected boolean)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    case when to_regclass('public.orders') is not null then 'orders'::text else null::text end,
    (to_regclass('public.orders') is not null);
$function$;

-- 6) Aggregate account metrics from v_bank_account_position in one scan.
create or replace function public.get_banking_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_result jsonb;
  v_total_bank numeric := 0;
  v_supplier numeric := 0;
  v_cod numeric := 0;
  v_unreconciled numeric := 0;
  v_start date;
  v_source text;
begin
  if not public.banking_user_allowed() then
    raise exception 'Not allowed';
  end if;

  select system_start_date
    into v_start
  from public.banking_settings
  where id = 1;

  select
    coalesce(sum(book_balance) filter (where is_active = true), 0),
    coalesce(sum(abs(coalesce(last_difference, 0))) filter (where is_active = true), 0)
  into v_total_bank, v_unreconciled
  from public.v_bank_account_position;

  select coalesce(sum(greatest(outstanding, 0)), 0)
    into v_supplier
  from public.v_supplier_payables;

  v_cod := public.banking_cod_receivable();

  select source_table
    into v_source
  from public.banking_cod_source_status()
  limit 1;

  v_result := jsonb_build_object(
    'system_start_date', v_start,
    'total_book_cash', coalesce(v_total_bank, 0),
    'cod_receivable', coalesce(v_cod, 0),
    'supplier_payable', coalesce(v_supplier, 0),
    'latest_reconciliation_difference_abs', coalesce(v_unreconciled, 0),
    'cod_source_table', v_source,
    'cod_source_detected', (v_source is not null)
  );

  return v_result;
end;
$function$;

commit;
