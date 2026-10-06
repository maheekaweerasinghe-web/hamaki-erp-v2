-- Hotfix: keep RM day-to-day issue/purchase entry operational without replaying full history.
-- Normal inserts are already validated and costed centrally by trg_rm_prepare_movement_insert.
-- Historical recalculation remains available for explicit maintenance/correction workflows.

begin;

drop trigger if exists trg_rm_recalculate_after_insert on public.rm_movements;

comment on function public.recalculate_rm_material_costs(uuid) is
  'Maintenance-only full-history RM WAC recalculation. Do not run automatically on routine RM inserts.';

commit;
