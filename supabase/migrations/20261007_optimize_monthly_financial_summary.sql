-- Hamaki ERP Financials performance optimization
-- Prevent monthly_operational_summary from being expanded/recomputed multiple times
-- inside monthly_financial_summary.
-- Financial/accounting formulas and output columns are unchanged.

begin;

create or replace view public.monthly_financial_summary as
with operational as materialized (
  select *
  from public.monthly_operational_summary
),
exceptional_by_month as (
  select
    mf.month_start,
    coalesce(sum(me.amount), 0::numeric) as exceptional_expenses
  from public.monthly_financials mf
  left join public.monthly_exceptional_expenses me
    on me.monthly_financial_id = mf.id
  group by mf.month_start
),
all_months as (
  select o.month_start
  from operational o
  union
  select mf.month_start
  from public.monthly_financials mf
)
select
  m.month_start,
  coalesce(o.dispatched_orders, 0::bigint) as dispatched_orders,
  coalesce(o.units_sold, 0::numeric) as units_sold,
  coalesce(o.product_sales, 0::numeric) as product_sales,
  coalesce(o.shipping_collected, 0::numeric) as shipping_collected,
  coalesce(o.materials_purchased, 0::numeric) as materials_purchased,
  coalesce(o.materials_issued, 0::numeric) as materials_issued,
  coalesce(f.payroll, 0::numeric) as payroll,
  coalesce(f.epf_etf, 0::numeric) as epf_etf,
  coalesce(f.advertising, 0::numeric) as advertising,
  coalesce(f.electricity, 0::numeric) as electricity,
  coalesce(f.courier_shipping, 0::numeric) as courier_shipping,
  coalesce(f.bank_payment_fees, 0::numeric) as bank_payment_fees,
  coalesce(f.vehicle_transport, 0::numeric) as vehicle_transport,
  coalesce(f.maintenance, 0::numeric) as maintenance,
  coalesce(f.income_tax, 0::numeric) as income_tax,
  coalesce(f.other_taxes_levies, 0::numeric) as other_taxes_levies,
  coalesce(f.other_regular_expenses, 0::numeric) as other_regular_expenses,
  coalesce(e.exceptional_expenses, 0::numeric) as exceptional_expenses,
  coalesce(f.is_complete, false) as is_complete,
  coalesce(o.net_product_sales, 0::numeric)
    - coalesce(o.materials_issued, 0::numeric) as gross_profit,
  coalesce(f.payroll, 0::numeric)
    + coalesce(f.epf_etf, 0::numeric)
    + coalesce(f.advertising, 0::numeric)
    + coalesce(f.electricity, 0::numeric)
    + coalesce(f.bank_payment_fees, 0::numeric)
    + coalesce(f.vehicle_transport, 0::numeric)
    + coalesce(f.maintenance, 0::numeric)
    + coalesce(f.other_regular_expenses, 0::numeric) as regular_expenses,
  coalesce(o.net_product_sales, 0::numeric)
    - coalesce(o.materials_issued, 0::numeric)
    - coalesce(f.payroll, 0::numeric)
    - coalesce(f.epf_etf, 0::numeric)
    - coalesce(f.advertising, 0::numeric)
    - coalesce(f.electricity, 0::numeric)
    - coalesce(f.bank_payment_fees, 0::numeric)
    - coalesce(f.vehicle_transport, 0::numeric)
    - coalesce(f.maintenance, 0::numeric)
    - coalesce(f.other_regular_expenses, 0::numeric) as operating_profit,
  coalesce(o.net_product_sales, 0::numeric)
    - coalesce(o.materials_issued, 0::numeric)
    - coalesce(f.payroll, 0::numeric)
    - coalesce(f.epf_etf, 0::numeric)
    - coalesce(f.advertising, 0::numeric)
    - coalesce(f.electricity, 0::numeric)
    - coalesce(f.bank_payment_fees, 0::numeric)
    - coalesce(f.vehicle_transport, 0::numeric)
    - coalesce(f.maintenance, 0::numeric)
    - coalesce(f.other_regular_expenses, 0::numeric)
    - coalesce(e.exceptional_expenses, 0::numeric) as profit_before_tax,
  coalesce(o.net_product_sales, 0::numeric)
    - coalesce(o.materials_issued, 0::numeric)
    - coalesce(f.payroll, 0::numeric)
    - coalesce(f.epf_etf, 0::numeric)
    - coalesce(f.advertising, 0::numeric)
    - coalesce(f.electricity, 0::numeric)
    - coalesce(f.bank_payment_fees, 0::numeric)
    - coalesce(f.vehicle_transport, 0::numeric)
    - coalesce(f.maintenance, 0::numeric)
    - coalesce(f.other_regular_expenses, 0::numeric)
    - coalesce(e.exceptional_expenses, 0::numeric)
    - coalesce(f.income_tax, 0::numeric)
    - coalesce(f.other_taxes_levies, 0::numeric) as net_profit,
  case
    when coalesce(o.net_product_sales, 0::numeric) = 0::numeric then 0::numeric
    else round(
      (
        coalesce(o.net_product_sales, 0::numeric)
        - coalesce(o.materials_issued, 0::numeric)
        - coalesce(f.payroll, 0::numeric)
        - coalesce(f.epf_etf, 0::numeric)
        - coalesce(f.advertising, 0::numeric)
        - coalesce(f.electricity, 0::numeric)
        - coalesce(f.bank_payment_fees, 0::numeric)
        - coalesce(f.vehicle_transport, 0::numeric)
        - coalesce(f.maintenance, 0::numeric)
        - coalesce(f.other_regular_expenses, 0::numeric)
        - coalesce(e.exceptional_expenses, 0::numeric)
        - coalesce(f.income_tax, 0::numeric)
        - coalesce(f.other_taxes_levies, 0::numeric)
      ) / coalesce(o.net_product_sales, 0::numeric) * 100::numeric,
      2
    )
  end as net_margin_pct,
  coalesce(o.cod_return_units, 0::numeric) as cod_return_units,
  coalesce(o.cod_return_value, 0::numeric) as cod_return_value,
  coalesce(o.net_product_sales, 0::numeric) as net_product_sales
from all_months m
left join operational o
  on o.month_start = m.month_start
left join public.monthly_financials f
  on f.month_start = m.month_start
left join exceptional_by_month e
  on e.month_start = m.month_start
order by m.month_start desc;

commit;
