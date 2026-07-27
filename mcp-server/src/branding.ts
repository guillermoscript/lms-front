import { LmsSession } from "./session.js";

/**
 * Tenant branding for widgets.
 *
 * The web app reads `tenants.primary_color` / `secondary_color` and injects
 * them as CSS custom properties in the document head
 * (`components/tenant/tenant-css-vars-server.tsx`). Widgets render inside a
 * host iframe that never sees that markup, so we ship the same values in the
 * tool result's `_meta` and let `resources/shared/branding.tsx` apply them.
 *
 * Injection is central (`installToolGuards` in register.ts), so every
 * widget-rendering tool is branded without touching its handler.
 */
export interface TenantBranding {
  name: string | null;
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
}

/** `_meta` key. Keep in sync with `BRANDING_META_KEY` in resources/shared/branding.tsx. */
export const BRANDING_META_KEY = "lms/branding";

/**
 * Per-tenant cache. Widget tools are read-heavy and branding changes about
 * never, so one query per tenant per TTL keeps the injection free. Cached
 * misses are stored too — a tenant with no colours must not re-query on every
 * single widget call.
 */
const TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; value: TenantBranding | null }>();

/** Drop a tenant's cached branding — call after a write that changes it. */
export function invalidateBranding(tenantId: string): void {
  cache.delete(tenantId);
}

/**
 * Fetch the caller's tenant branding. Runs on the caller's RLS-scoped client,
 * so a user can only ever read their own tenant's row. Returns `null` when the
 * tenant has no colours set, which leaves widgets on the platform default.
 */
export async function getTenantBranding(
  session: LmsSession
): Promise<TenantBranding | null> {
  const tenantId = session.getTenantId();
  const hit = cache.get(tenantId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  let value: TenantBranding | null = null;
  try {
    const { data } = await session
      .getClient()
      .from("tenants")
      .select("name, logo_url, primary_color, secondary_color")
      .eq("id", tenantId)
      .maybeSingle();

    const primary = (data?.primary_color as string | undefined)?.trim();
    const secondary = (data?.secondary_color as string | undefined)?.trim();

    // Nothing to theme with — cache the miss so we stop asking.
    if (data && (primary || secondary || data.logo_url)) {
      value = {
        name: (data.name as string | undefined) ?? null,
        logo_url: (data.logo_url as string | undefined) ?? null,
        primary_color: primary || null,
        secondary_color: secondary || null,
      };
    }
  } catch {
    // Branding is decoration. A failed lookup must never fail the tool.
    value = null;
  }

  cache.set(tenantId, { at: Date.now(), value });
  return value;
}
