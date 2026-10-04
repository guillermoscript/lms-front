-- Drop the legacy primary_color / secondary_color columns from tenants (#779).
--
-- The theme kit (`tenant_settings.theme_preset`) has been the only theming
-- path since #763 (migration `20260915140000_theme_kit_only.sql`), which
-- deleted the `tenant_settings` rows these columns used to be overridden by
-- but deliberately left the `tenants` columns alone: the MCP server still
-- read `tenants.primary_color` / `secondary_color` directly for widget
-- branding (#765). #779 moves that read onto the theme kit
-- (`mcp-server/src/branding.ts`, `deriveWidgetBrand()`), so nothing left in
-- the app or the MCP server reads either column.
--
-- No view or function references them (grepped every migration for
-- `primary_color` / `secondary_color`: only the column-creation migration
-- `20260216200000_create_multi_tenant_infrastructure.sql`, the retired
-- `tenant_settings` rows in `20260216184917_add_onboarding_and_branding_
-- settings.sql`, and `20260915140000_theme_kit_only.sql`'s note above turn up).

ALTER TABLE public.tenants
  DROP COLUMN IF EXISTS primary_color,
  DROP COLUMN IF EXISTS secondary_color;
