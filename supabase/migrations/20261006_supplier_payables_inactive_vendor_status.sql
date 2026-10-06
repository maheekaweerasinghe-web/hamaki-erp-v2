begin;

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
    - coalesce(py.payments_since_start, 0) as outstanding,
  v.status as vendor_status
from public.rm_vendors v
left join opening o on o.vendor_id = v.id
left join purchases p on p.vendor_id = v.id
left join payments py on py.vendor_id = v.id;

commit;
