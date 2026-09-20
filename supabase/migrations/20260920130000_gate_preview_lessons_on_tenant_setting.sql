-- #799 (part 1 of 2): a school-level switch for free lesson previews.
--
-- 20260722120000_lesson_preview.sql (#426) let anon read lessons.is_preview
-- rows; 20260920120000_backfill_lesson_previews.sql (#797) then turned the
-- first lesson of every existing published course into one, without asking.
-- A school that does not want to give content away now has one switch,
-- `tenant_settings.free_preview_enabled` (`{ enabled: boolean }`, same shape
-- as every other admin toggle — see app/actions/admin/settings.ts), that
-- turns public preview access off tenant-wide instead of hunting down every
-- lesson. A missing row means ON, so nothing changes for existing schools.
--
-- The setting subquery is intentionally NOT correlated to `lessons` — it
-- looks up `(SELECT public.get_tenant_id())`, not `lessons.tenant_id` (the
-- row's own tenant_id is already pinned to the same value by the policy's
-- next AND) — so Postgres runs it once per query as an InitPlan, the same
-- way the existing `tenant_id = (SELECT public.get_tenant_id())` line does,
-- instead of once per row.

DROP POLICY IF EXISTS "Anon can view preview lessons" ON public.lessons;

CREATE POLICY "Anon can view preview lessons" ON public.lessons
  FOR SELECT TO anon
  USING (
    is_preview = true
    AND status = 'published'
    AND tenant_id = (SELECT public.get_tenant_id())
    AND COALESCE(
      (
        SELECT (ts.setting_value ->> 'enabled')::boolean
        FROM public.tenant_settings ts
        WHERE ts.tenant_id = (SELECT public.get_tenant_id())
          AND ts.setting_key = 'free_preview_enabled'
      ),
      true
    )
    AND EXISTS (
      SELECT 1
      FROM public.courses c
      WHERE c.course_id = lessons.course_id
        AND c.status = 'published'
        AND c.tenant_id = lessons.tenant_id
    )
  );
