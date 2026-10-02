-- Hamaki ERP: Quick COD Return by scanned waybill barcode
-- Atomic, duplicate-safe stock restoration for returned parcels.

begin;

create index if not exists idx_dispatch_scans_waybill_id
  on public.dispatch_scans (waybill_id);

create index if not exists idx_stock_movements_return_reference
  on public.stock_movements (reference_type, reference_no)
  where direction = 'IN' and reference_type = 'Return COD';

create or replace function public.quick_return_cod(p_waybill_id text)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_waybill text := trim(coalesce(p_waybill_id, ''));
  v_order_id uuid;
  v_order_no text;
  v_user_id uuid;
  v_role text;
  v_item_count integer := 0;
  v_total_qty numeric := 0;
  v_items json := '[]'::json;
begin
  if v_waybill = '' then
    raise exception 'Waybill barcode is required';
  end if;

  select u.id, upper(trim(u.role))
    into v_user_id, v_role
  from public.users u
  where u.auth_user_id = auth.uid()
    and u.is_active = true
  limit 1;

  if v_user_id is null or v_role not in ('ADMIN', 'ACCOUNTANT') then
    raise exception 'Not allowed';
  end if;

  -- Prevent two scanners from processing the same returned parcel concurrently.
  perform pg_advisory_xact_lock(hashtext('quick_return_cod:' || v_waybill));

  select ds.order_id
    into v_order_id
  from public.dispatch_scans ds
  where trim(ds.waybill_id) = v_waybill
    and ds.order_id is not null
  order by ds.scanned_at desc
  limit 1;

  if v_order_id is null then
    raise exception 'Waybill % was not found in dispatch history', v_waybill;
  end if;

  select o.order_no
    into v_order_no
  from public.orders o
  where o.id = v_order_id;

  if v_order_no is null then
    raise exception 'Order linked to waybill % was not found', v_waybill;
  end if;

  if exists (
    select 1
    from public.stock_movements sm
    where sm.direction = 'IN'
      and sm.reference_type = 'Return COD'
      and sm.reference_no = v_waybill
      and sm.reference_id = v_order_id
  ) then
    raise exception 'This returned parcel has already been added to inventory';
  end if;

  if exists (
    select 1
    from public.order_items oi
    where oi.order_id = v_order_id
      and oi.product_id is null
  ) then
    raise exception 'Order % contains an item without a linked product; use manual Return COD entry', v_order_no;
  end if;

  if not exists (
    select 1
    from public.order_items oi
    where oi.order_id = v_order_id
      and oi.product_id is not null
      and coalesce(oi.qty, 0) > 0
  ) then
    raise exception 'No returnable items were found for order %', v_order_no;
  end if;

  with returned_items as (
    select
      oi.product_id,
      sum(coalesce(oi.qty, 0))::numeric as qty,
      max(coalesce(p.selling_price, oi.unit_price, 0))::numeric as sell_price,
      max(coalesce(nullif(trim(p.sku), ''), nullif(trim(oi.sku_snapshot), ''), '-')) as sku,
      max(
        coalesce(
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
          '-'
        )
      ) as product
    from public.order_items oi
    left join public.products p on p.id = oi.product_id
    where oi.order_id = v_order_id
      and oi.product_id is not null
      and coalesce(oi.qty, 0) > 0
    group by oi.product_id
  ),
  inserted as (
    insert into public.stock_movements (
      movement_date,
      product_id,
      direction,
      qty,
      sell_price_at_time,
      production_value,
      reference_type,
      reference_id,
      reference_no,
      note,
      entered_by_user_id
    )
    select
      ((now() at time zone 'Asia/Colombo')::date::timestamp at time zone 'Asia/Colombo'),
      ri.product_id,
      'IN',
      ri.qty,
      ri.sell_price,
      round(ri.qty * ri.sell_price, 2),
      'Return COD',
      v_order_id,
      v_waybill,
      'Quick barcode return • ' || v_order_no,
      v_user_id
    from returned_items ri
    returning product_id, qty
  ),
  summary as (
    select count(*)::integer as item_count, coalesce(sum(qty), 0)::numeric as total_qty
    from inserted
  ),
  item_json as (
    select coalesce(
      json_agg(
        json_build_object(
          'product_id', ri.product_id,
          'sku', ri.sku,
          'product', ri.product,
          'qty', ri.qty
        )
        order by ri.sku
      ),
      '[]'::json
    ) as items
    from returned_items ri
  )
  select s.item_count, s.total_qty, j.items
    into v_item_count, v_total_qty, v_items
  from summary s
  cross join item_json j;

  return json_build_object(
    'order_id', v_order_id,
    'order_no', v_order_no,
    'waybill_id', v_waybill,
    'item_count', v_item_count,
    'total_qty', v_total_qty,
    'items', v_items
  );
end;
$function$;

revoke all on function public.quick_return_cod(text) from public;
grant execute on function public.quick_return_cod(text) to authenticated;

commit;
