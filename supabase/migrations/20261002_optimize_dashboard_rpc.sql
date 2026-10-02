-- Hamaki ERP performance: optimize get_dashboard_data()
-- Preserves the existing JSON shape and business logic.
-- Main change: use sargable Colombo date ranges so idx_orders_order_date can be used,
-- and reuse the current-month order set instead of rescanning orders repeatedly.

begin;

create or replace function public.get_dashboard_data()
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  result json;
  v_today date := (now() at time zone 'Asia/Colombo')::date;
  v_today_start timestamptz;
  v_tomorrow_start timestamptz;
  v_month_start timestamptz;
  v_next_month_start timestamptz;
  v_five_day_start timestamptz;
begin
  v_today_start := (v_today::timestamp at time zone 'Asia/Colombo');
  v_tomorrow_start := ((v_today + 1)::timestamp at time zone 'Asia/Colombo');
  v_month_start := (date_trunc('month', v_today::timestamp) at time zone 'Asia/Colombo');
  v_next_month_start := ((date_trunc('month', v_today::timestamp) + interval '1 month') at time zone 'Asia/Colombo');
  v_five_day_start := ((v_today - 4)::timestamp at time zone 'Asia/Colombo');

  with
  month_orders as materialized (
    select
      o.id,
      o.order_no,
      o.order_total,
      o.delivery_charge,
      o.status,
      o.order_date,
      o.sale_platform,
      o.sales_user_id,
      o.created_by_user_id
    from public.orders o
    where o.order_date >= v_month_start
      and o.order_date < v_next_month_start
  ),
  today_summary as (
    select
      coalesce(
        sum(coalesce(o.order_total, 0) - coalesce(o.delivery_charge, 0))
          filter (where coalesce(o.status, '') <> 'CANCELLED'),
        0
      ) as today_sales,
      count(*) filter (where coalesce(o.status, '') <> 'CANCELLED') as today_orders
    from public.orders o
    where o.order_date >= v_today_start
      and o.order_date < v_tomorrow_start
  ),
  mtd_summary as (
    select
      coalesce(
        sum(coalesce(order_total, 0) - coalesce(delivery_charge, 0))
          filter (where coalesce(status, '') <> 'CANCELLED'),
        0
      ) as sales,
      count(*) as orders,
      count(*) filter (where coalesce(status, '') = 'CANCELLED') as cancelled
    from month_orders
  ),
  last5 as (
    select
      (o.order_date at time zone 'Asia/Colombo')::date as day,
      count(*) as orders,
      coalesce(
        sum(coalesce(o.order_total, 0) - coalesce(o.delivery_charge, 0))
          filter (where coalesce(o.status, '') <> 'CANCELLED'),
        0
      ) as sales,
      count(*) filter (where coalesce(o.status, '') = 'CANCELLED') as cancelled,
      coalesce(
        sum(coalesce(o.order_total, 0) - coalesce(o.delivery_charge, 0))
          filter (where coalesce(o.status, '') <> 'CANCELLED'),
        0
      ) as net_sales
    from public.orders o
    where o.order_date >= v_five_day_start
      and o.order_date < v_tomorrow_start
    group by (o.order_date at time zone 'Asia/Colombo')::date
    order by day desc
  ),
  platform as (
    select
      coalesce(o.sale_platform, 'Unknown') as sale_platform,
      count(*) as orders,
      coalesce(
        sum(coalesce(o.order_total, 0) - coalesce(o.delivery_charge, 0))
          filter (where coalesce(o.status, '') <> 'CANCELLED'),
        0
      ) as sales,
      count(*) filter (where coalesce(o.status, '') = 'CANCELLED') as cancelled,
      round(
        (
          count(*) filter (where coalesce(o.status, '') = 'CANCELLED')::numeric
          / nullif(count(*), 0)
        ) * 100,
        1
      ) as cancel_rate
    from month_orders o
    group by coalesce(o.sale_platform, 'Unknown')
    order by sales desc
  ),
  order_user_map as (
    select
      o.id,
      o.order_no,
      o.order_total,
      o.delivery_charge,
      o.status,
      o.order_date,
      coalesce(
        nullif(trim(u1.full_name), ''),
        nullif(trim(u2.full_name), ''),
        nullif(trim(u3.full_name), ''),
        nullif(trim(split_part(o.order_no, '-', 1)), ''),
        'Unknown'
      ) as sales_person,
      coalesce(
        nullif(trim(u1.sales_code), ''),
        nullif(trim(u2.sales_code), ''),
        nullif(trim(u3.sales_code), ''),
        nullif(trim(split_part(o.order_no, '-', 1)), ''),
        'Unknown'
      ) as sales_code
    from month_orders o
    left join public.users u1 on u1.id = o.sales_user_id
    left join public.users u2 on u2.id = o.created_by_user_id
    left join public.users u3
      on upper(trim(u3.sales_code)) = upper(trim(split_part(o.order_no, '-', 1)))
  ),
  salesperson as (
    select
      sales_person,
      sales_code,
      count(*) as orders,
      coalesce(
        sum(coalesce(order_total, 0) - coalesce(delivery_charge, 0))
          filter (where coalesce(status, '') <> 'CANCELLED'),
        0
      ) as sales,
      count(*) filter (where coalesce(status, '') = 'CANCELLED') as cancelled,
      round(
        (
          count(*) filter (where coalesce(status, '') = 'CANCELLED')::numeric
          / nullif(count(*), 0)
        ) * 100,
        1
      ) as cancel_rate
    from order_user_map
    group by sales_person, sales_code
    order by sales desc, orders desc, sales_person asc
  ),
  top_products as (
    select
      coalesce(
        nullif(trim(oi.sku_snapshot), ''),
        nullif(trim(p.sku), ''),
        '-'
      ) as sku,
      coalesce(
        nullif(
          concat_ws(
            ' • ',
            nullif(trim(oi.product_type_snapshot), ''),
            nullif(trim(oi.material_snapshot), ''),
            nullif(trim(oi.color_snapshot), ''),
            nullif(trim(oi.size_snapshot), '')
          ),
          ''
        ),
        nullif(
          concat_ws(
            ' • ',
            nullif(trim(p.product_type), ''),
            nullif(trim(p.material), ''),
            nullif(trim(p.color), ''),
            nullif(trim(p.size), '')
          ),
          ''
        ),
        '-'
      ) as product,
      coalesce(sum(oi.qty), 0) as units_sold,
      coalesce(
        sum(oi.line_total) filter (where coalesce(o.status, '') <> 'CANCELLED'),
        0
      ) as sales_value
    from public.order_items oi
    join month_orders o on o.id = oi.order_id
    left join public.products p on p.id = oi.product_id
    group by
      coalesce(
        nullif(trim(oi.sku_snapshot), ''),
        nullif(trim(p.sku), ''),
        '-'
      ),
      coalesce(
        nullif(
          concat_ws(
            ' • ',
            nullif(trim(oi.product_type_snapshot), ''),
            nullif(trim(oi.material_snapshot), ''),
            nullif(trim(oi.color_snapshot), ''),
            nullif(trim(oi.size_snapshot), '')
          ),
          ''
        ),
        nullif(
          concat_ws(
            ' • ',
            nullif(trim(p.product_type), ''),
            nullif(trim(p.material), ''),
            nullif(trim(p.color), ''),
            nullif(trim(p.size), '')
          ),
          ''
        ),
        '-'
      )
    order by sales_value desc, units_sold desc
    limit 10
  )
  select json_build_object(
    'summary', (
      select json_build_object(
        'today_sales', today_sales,
        'today_orders', today_orders
      )
      from today_summary
    ),
    'mtd', (
      select json_build_object(
        'sales', sales,
        'orders', orders,
        'cancelled', cancelled
      )
      from mtd_summary
    ),
    'last5days', (
      select coalesce(json_agg(last5), '[]'::json)
      from last5
    ),
    'platform', (
      select coalesce(json_agg(platform), '[]'::json)
      from platform
    ),
    'salesperson', (
      select coalesce(json_agg(salesperson), '[]'::json)
      from salesperson
    ),
    'top_products', (
      select coalesce(json_agg(top_products), '[]'::json)
      from top_products
    )
  )
  into result;

  return result;
end;
$function$;

commit;
