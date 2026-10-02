-- Hamaki ERP - search full RM movement history when filters are used.
-- Default (no filters): latest 100 rows.
-- Filtered: searches the complete rm_movements table.

begin;

create or replace function public.search_rm_movements(
  p_material_query text default null,
  p_vendor_query text default null,
  p_reference_query text default null,
  p_entered_by_query text default null,
  p_date_from date default null,
  p_date_to date default null,
  p_movement_type text default null,
  p_status text default null
)
returns setof jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_has_filters boolean;
begin
  perform public.rm_current_operator_id();

  v_has_filters :=
    nullif(trim(coalesce(p_material_query, '')), '') is not null
    or nullif(trim(coalesce(p_vendor_query, '')), '') is not null
    or nullif(trim(coalesce(p_reference_query, '')), '') is not null
    or nullif(trim(coalesce(p_entered_by_query, '')), '') is not null
    or p_date_from is not null
    or p_date_to is not null
    or p_movement_type is not null
    or p_status is not null;

  if p_movement_type is not null and p_movement_type not in ('PURCHASE', 'ISSUE') then
    raise exception 'Invalid RM movement type filter.';
  end if;

  if p_status is not null and p_status not in ('ACTIVE', 'VOIDED') then
    raise exception 'Invalid RM movement status filter.';
  end if;

  if v_has_filters then
    return query
    select jsonb_build_object(
      'id', m.id,
      'movement_date', m.movement_date,
      'movement_type', m.movement_type,
      'qty_in', m.qty_in,
      'qty_out', m.qty_out,
      'unit', m.unit,
      'unit_cost', m.unit_cost,
      'line_value', m.line_value,
      'note', m.note,
      'reference', m.reference,
      'created_at', m.created_at,
      'voided_at', m.voided_at,
      'void_reason', m.void_reason,
      'material_code', rm.material_code,
      'material_name', rm.material_name,
      'variant', rm.variant,
      'vendor_name', v.vendor_name,
      'entered_by_name', u.full_name
    )
    from public.rm_movements m
    join public.rm_materials rm on rm.id = m.rm_material_id
    left join public.rm_vendors v on v.id = m.vendor_id
    left join public.users u on u.id = m.entered_by_user_id
    where
      (
        nullif(trim(coalesce(p_material_query, '')), '') is null
        or m.id::text ilike '%' || trim(p_material_query) || '%'
        or rm.material_code ilike '%' || trim(p_material_query) || '%'
        or rm.material_name ilike '%' || trim(p_material_query) || '%'
        or coalesce(rm.variant, '') ilike '%' || trim(p_material_query) || '%'
        or coalesce(m.unit, '') ilike '%' || trim(p_material_query) || '%'
      )
      and (
        nullif(trim(coalesce(p_vendor_query, '')), '') is null
        or coalesce(v.vendor_name, '') ilike '%' || trim(p_vendor_query) || '%'
      )
      and (
        nullif(trim(coalesce(p_reference_query, '')), '') is null
        or coalesce(m.reference, '') ilike '%' || trim(p_reference_query) || '%'
        or coalesce(m.note, '') ilike '%' || trim(p_reference_query) || '%'
        or coalesce(m.void_reason, '') ilike '%' || trim(p_reference_query) || '%'
        or m.id::text ilike '%' || trim(p_reference_query) || '%'
      )
      and (
        nullif(trim(coalesce(p_entered_by_query, '')), '') is null
        or coalesce(u.full_name, '') ilike '%' || trim(p_entered_by_query) || '%'
      )
      and (p_date_from is null or m.movement_date::date >= p_date_from)
      and (p_date_to is null or m.movement_date::date <= p_date_to)
      and (p_movement_type is null or m.movement_type = p_movement_type)
      and (
        p_status is null
        or (p_status = 'ACTIVE' and m.voided_at is null)
        or (p_status = 'VOIDED' and m.voided_at is not null)
      )
    order by m.created_at desc, m.id desc;

  else
    return query
    select jsonb_build_object(
      'id', m.id,
      'movement_date', m.movement_date,
      'movement_type', m.movement_type,
      'qty_in', m.qty_in,
      'qty_out', m.qty_out,
      'unit', m.unit,
      'unit_cost', m.unit_cost,
      'line_value', m.line_value,
      'note', m.note,
      'reference', m.reference,
      'created_at', m.created_at,
      'voided_at', m.voided_at,
      'void_reason', m.void_reason,
      'material_code', rm.material_code,
      'material_name', rm.material_name,
      'variant', rm.variant,
      'vendor_name', v.vendor_name,
      'entered_by_name', u.full_name
    )
    from public.rm_movements m
    join public.rm_materials rm on rm.id = m.rm_material_id
    left join public.rm_vendors v on v.id = m.vendor_id
    left join public.users u on u.id = m.entered_by_user_id
    order by m.created_at desc, m.id desc
    limit 100;
  end if;
end;
$$;

revoke all on function public.search_rm_movements(
  text, text, text, text, date, date, text, text
) from public;

grant execute on function public.search_rm_movements(
  text, text, text, text, date, date, text, text
) to authenticated;

commit;
