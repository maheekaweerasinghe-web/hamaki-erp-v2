-- Add lightweight payment-method lookup for Pending Orders.
-- One batched RPC returns all current pending order payment types.
-- This avoids one query per row and keeps the Pending Orders table fast.

create or replace function public.get_pending_order_payment_types()
returns table (
  order_id uuid,
  transaction_type text
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    o.id as order_id,
    coalesce(o.transaction_type, 'COD')::text as transaction_type
  from public.orders o
  where o.status = 'PENDING'
  order by o.created_at desc;
$function$;

revoke all on function public.get_pending_order_payment_types() from public;
grant execute on function public.get_pending_order_payment_types() to authenticated;
