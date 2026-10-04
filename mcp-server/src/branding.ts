import { LmsSession } from "./session.js";
import {
  deriveWidgetBrand,
  resolveSchoolTheme,
  SCHOOL_THEME_SETTING_KEY,
} from "../views/shared/kit-brand.js";

/**
 * Tenant branding for widgets (issue #779).
 *
 * The web app resolves the theme kit — `tenant_settings.theme_preset`, gated
 * by the `custom_branding` plan feature — and paints it as CSS custom
 * properties in the document head (`TenantCssVarsServer`). Widgets render
 * inside a host iframe that never sees that markup, so we resolve the same
 * theme on the caller's RLS-scoped client, derive literal colours with
 * `deriveWidgetBrand()` (`../views/shared/kit-brand.ts`, a mirror of
 * `lib/themes/brand-outputs.ts`), and ship them in the tool result's `_meta`
 * for `views/shared/branding.tsx` to apply.
 *
 * `tenants.primary_color` / `secondary_color` are gone (frozen since #763,
 * dropped by migration `20260917150000_drop_tenants_legacy_colors.sql`) — the
 * theme kit is the only theming path, same as the app.
 *
 * Injection is central (`installToolGuards` in register.ts), so every
 * widget-rendering tool is branded without touching its handler.
 */
export interface TenantBranding {
  name: string | null;
  logo_url: string | null;
  /** A filled button/badge colour — what the app's `--primary` resolves to. */
  button: string;
  /** Text on `button` (AA). */
  buttonInk: string;
  /** Brand-coloured text — headings, links, labels. */
  brandText: string;
  /** The theme's heading font family, or `null` on the platform palette. */
  headingFont: string | null;
}

/** `_meta` key. Keep in sync with `BRANDING_META_KEY` in views/shared/branding.tsx. */
export const BRANDING_META_KEY = "lms/branding";

/**
 * Per-tenant cache. Widget tools are read-heavy and branding changes about
 * never, so one query per tenant per TTL keeps the injection free.
 */
const TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; value: TenantBranding | null }>();

/** Drop a tenant's cached branding — call after a write that changes it. */
export function invalidateBranding(tenantId: string): void {
  cache.delete(tenantId);
}

interface PlanFeaturesResult {
  features?: { custom_branding?: boolean };
}

/**
 * Fetch the caller's tenant branding. Runs on the caller's RLS-scoped client,
 * so a user can only ever read their own tenant's row and settings. Always
 * resolves to a colour — the theme kit's, or the platform palette when the
 * tenant has none — so the only `null` is a failed lookup (no session, a
 * query error), which leaves widgets on their own built-in default.
 */
export async function getTenantBranding(
  session: LmsSession
): Promise<TenantBranding | null> {
  const tenantId = session.getTenantId();
  const hit = cache.get(tenantId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  let value: TenantBranding | null = null;
  try {
    const supabase = session.getClient();
    const [tenantRes, settingsRes, planRes] = await Promise.all([
      supabase.from("tenants").select("name, logo_url").eq("id", tenantId).maybeSingle(),
      supabase
        .from("tenant_settings")
        .select("setting_value")
        .eq("tenant_id", tenantId)
        .eq("setting_key", SCHOOL_THEME_SETTING_KEY)
        .maybeSingle(),
      // SECURITY DEFINER, same RPC the web app's usePlanFeatures() reads —
      // resolves the plan features gate without a service-role client. A
      // failure here just means no custom brand colour, never a hard error.
      supabase.rpc("get_plan_features", { _tenant_id: tenantId }),
    ]);

    const customBranding =
      (planRes.data as PlanFeaturesResult | null)?.features?.custom_branding === true;
    const theme = resolveSchoolTheme(settingsRes.data?.setting_value, { customBranding });
    const outputs = deriveWidgetBrand(theme);

    value = {
      name: (tenantRes.data?.name as string | undefined) ?? null,
      logo_url: (tenantRes.data?.logo_url as string | undefined) ?? null,
      button: outputs.button,
      buttonInk: outputs.buttonInk,
      brandText: outputs.brandText,
      headingFont: outputs.headingFont,
    };
  } catch {
    // Branding is decoration. A failed lookup must never fail the tool.
    value = null;
  }

  cache.set(tenantId, { at: Date.now(), value });
  return value;
}
