import { z } from "zod";
import type { LmsServer } from "../server-types.js";
import { LmsSession } from "../session.js";
import { errorResult, structured } from "../format.js";
import { invalidateBranding } from "../branding.js";
import { originForHost } from "./certificates.js";
import { getPlatformDomain } from "../env.js";
import {
  getTenantPlanUsage,
  isPlanLimitError,
  planLimitMessage,
  studentLimitHeadroomError,
} from "../plan-limits.js";
import {
  KIT_THEME_IDS,
  SCHOOL_THEME_SETTING_KEY,
  isKitSwatch,
  kitThemeSwatches,
  parseStoredKitTheme,
  resolveSchoolTheme,
} from "../../views/shared/kit-brand.js";
import {
  buildSettingsRows,
  defaultCurrencyForCountry,
  groupSettings,
  isCurrencySettingEmpty,
  normalizeCountry,
  SCHOOL_CURRENCIES,
  type SettingValue,
} from "../school-settings.js";

/**
 * School-level administration (#898): settings, theme, members, invitations
 * and plan usage — what an admin does under Settings / Users / Billing in the
 * dashboard.
 *
 * Every tool here is admin-only (TEACHER_DENY_TOOLS in tool-policy.ts) and
 * re-checks the role in the handler. The web actions run these writes on a
 * service-role client after `getUserRole()`; the MCP server holds no service
 * role, so each write goes through the RLS policy that already grants tenant
 * admins the same table (`tenant_settings` "Tenant admins can manage own
 * settings", `tenants` "Tenant admins can update own tenant", `tenant_users`
 * "Tenant admins can manage members", `tenant_invitations` "Admins can manage
 * tenant invitations"), and every query still filters `tenant_id` explicitly.
 * What a policy alone would allow but the web forbids — the plan column on
 * `tenants`, an un-gated custom colour, demoting the last admin — is refused
 * here because no tool input can express it.
 */

/** Seeded ids are not RFC-4122 versioned, so zod's `.uuid()` would refuse them. */
const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MEMBER_ROLES = ["student", "teacher", "admin"] as const;
const INVITE_ROLES = ["student", "teacher"] as const;

/** Postgres SQLSTATE `guard_tenant_ban` raises (#892). */
const TENANT_BANNED_SQLSTATE = "LM002";

const BANNED_MESSAGE =
  "This member is banned from the school. Lift the ban from the dashboard (Users) first.";

function adminSession(ctx: unknown): LmsSession {
  const session = LmsSession.fromContext(ctx);
  if (!session.isAdmin()) {
    throw new Error("Only school admins can manage school settings, members and billing.");
  }
  return session;
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ── Schemas (exported for tests) ──────────────────────────────────────────────

const storedThemeSchema = z.object({
  type: z.literal("kit"),
  theme: z.enum(KIT_THEME_IDS),
  brand: z.string(),
});

export const getSchoolSettingsOutput = z.object({
  school: z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    country: z.string().nullable(),
    logo_url: z.string().nullable(),
    domain: z.string().nullable(),
    plan: z.string().nullable(),
    status: z.string().nullable(),
  }),
  settings: z
    .record(z.string(), z.record(z.string(), z.unknown()))
    .describe("tenant_settings by category; credentials are reduced to { redacted, set }"),
  theme: z.object({
    stored: storedThemeSchema.nullable().describe("What is saved; null = platform palette"),
    effective: storedThemeSchema
      .nullable()
      .describe("What renders after the custom_branding plan gate"),
    custom_branding_allowed: z.boolean(),
  }),
  available_themes: z.array(
    z.object({
      id: z.enum(KIT_THEME_IDS),
      swatches: z.array(z.object({ hex: z.string(), name: z.string() })),
    })
  ),
  currencies: z.array(z.string()),
});

export const updateSchoolSettingsInput = z.object({
  site_name: z
    .string()
    .max(200)
    .optional()
    .describe("Name shown on the school's site; empty falls back to the school's own name"),
  site_description: z.string().max(1000).optional().describe("Short description of the school"),
  contact_email: z.string().max(254).optional().describe("Public contact email; empty clears it"),
  support_email: z.string().max(254).optional().describe("Support email; empty clears it"),
  timezone: z.string().max(64).optional().describe("IANA time zone, e.g. 'America/Bogota'"),
  logo_url: z.string().max(2048).optional().describe("Logo image URL (http/https); empty clears it"),
  favicon_url: z.string().max(2048).optional().describe("Favicon URL (http/https); empty clears it"),
  country: z
    .string()
    .max(8)
    .optional()
    .describe(
      "ISO 3166-1 alpha-2 country code (e.g. 'CO'). Fills the currency from the country only when none is set yet"
    ),
  currency: z
    .string()
    .max(8)
    .optional()
    .describe("Default selling currency (ISO 4217, e.g. 'USD', 'COP')"),
  allow_self_enrollment: z.boolean().optional().describe("Students may enroll themselves"),
  auto_enrollment: z.boolean().optional(),
  require_enrollment_approval: z.boolean().optional(),
  course_capacity_enabled: z.boolean().optional(),
  free_preview_enabled: z
    .boolean()
    .optional()
    .describe("Lessons marked as free previews are readable without enrolling"),
  max_enrollments_per_user: z.number().int().min(0).optional().describe("0 = no limit"),
  enrollment_expiration_days: z.number().int().min(0).optional().describe("0 = never expires"),
  manual_payment_accounts: z
    .array(z.unknown())
    .max(50)
    .optional()
    .describe(
      "Replaces the school's whole list of offline payment accounts (max 12 kept). Each item: { kind?: zelle|binance|paypal|zinli|cash|pago_movil, method, bank, identifier, email, holder, document, note }. Unknown fields are dropped; never put API keys or passwords here, students can read this list"
    ),
});

export const updateSchoolSettingsOutput = z.object({
  updated_keys: z.array(z.string()),
  country: z.string().nullable(),
  currency_filled: z.string().nullable(),
});

export const setSchoolThemeInput = z.object({
  theme: z
    .enum(KIT_THEME_IDS)
    .optional()
    .describe("Theme kit: estructura (cool), andina (warm), kodigo (dark), luz (neutral)"),
  brand: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional()
    .describe(
      "Brand colour #RRGGBB. One of the theme's six swatches works on every plan; any other colour needs the custom_branding feature. Defaults to the theme's recommended swatch"
    ),
  reset: z
    .boolean()
    .optional()
    .describe("true removes the school's theme so it renders the platform palette"),
});

export const setSchoolThemeOutput = z.object({
  theme: storedThemeSchema.nullable(),
  custom: z.boolean(),
});

export const listMembersInput = z.object({
  role: z.enum(MEMBER_ROLES).optional().describe("Only members with this role"),
  status: z
    .enum(["active", "banned", "removed", "all"])
    .default("active")
    .describe("Membership status filter (default active)"),
  include_invitations: z
    .boolean()
    .default(false)
    .describe("Also list pending invitations"),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});

export const listMembersOutput = z.object({
  total: z.number(),
  members: z.array(
    z.object({
      user_id: z.string(),
      full_name: z.string().nullable(),
      role: z.string(),
      status: z.string(),
      joined_at: z.string().nullable(),
    })
  ),
  invitations: z
    .array(
      z.object({
        id: z.string(),
        email: z.string(),
        role: z.string(),
        created_at: z.string(),
      })
    )
    .optional()
    .describe("Newest pending invitations, at most 100"),
  invitations_total: z
    .number()
    .optional()
    .describe("All pending invitations, which can exceed the listed ones"),
});

export const changeMemberRoleInput = z.object({
  user_id: z.string().regex(UUID_LIKE).describe("The member's user id (from lms_list_school_members)"),
  role: z.enum(MEMBER_ROLES).describe("The member's new role in this school"),
});

export const changeMemberRoleOutput = z.object({
  user_id: z.string(),
  previous_role: z.string(),
  role: z.string(),
  changed: z.boolean(),
});

export const inviteMemberInput = z.object({
  email: z.string().email().max(254).describe("Email the person will sign up / sign in with"),
  role: z
    .enum(INVITE_ROLES)
    .default("student")
    .describe("Role they get when they join (admins are promoted after joining)"),
});

export const inviteMemberOutput = z.object({
  invitation_id: z.string(),
  email: z.string(),
  role: z.string(),
  join_url: z.string().nullable(),
  email_sent: z.boolean(),
  student_limit_reached: z.boolean(),
});

export const planUsageOutput = z.object({
  plan: z.string().nullable(),
  plan_name: z.string().nullable(),
  transaction_fee_percent: z.number().nullable(),
  features: z.record(z.string(), z.unknown()),
  limits: z.record(z.string(), z.unknown()),
  usage: z
    .object({
      courses: z.number(),
      students: z.number(),
      max_courses: z.number(),
      max_students: z.number(),
    })
    .nullable(),
});

// ── Helpers ──────────────────────────────────────────────────────────────────

interface PlanFeaturesPayload {
  plan?: string;
  plan_name?: string;
  features?: Record<string, unknown>;
  limits?: Record<string, unknown>;
  transaction_fee_percent?: number | string | null;
}

/**
 * `get_plan_features` — the single source of truth the web `usePlanFeatures()`
 * reads. Resolves `tenants.plan` with no `is_active` filter (20261003120000),
 * so a tenant on a retired or hidden plan gets that plan's features, the same
 * plan `getTenantPlan()` and `get_tenant_plan_usage` see.
 */
async function getPlanFeatures(session: LmsSession): Promise<PlanFeaturesPayload | null> {
  const { data, error } = await session
    .getClient()
    .rpc("get_plan_features", { _tenant_id: session.getTenantId() });
  if (error) throw new Error(`Loading plan features: ${error.message}`);
  return (data as PlanFeaturesPayload | null) ?? null;
}

/** `<origin>/join-school` for the school, or null when the origin is unknown. */
async function joinUrlFor(session: LmsSession): Promise<string | null> {
  const { data } = await session
    .getClient()
    .from("tenants")
    .select("slug, domain")
    .eq("id", session.getTenantId())
    .maybeSingle();
  const custom = (data?.domain as string | null | undefined)?.trim();
  const slug = (data?.slug as string | null | undefined)?.trim();
  const platform = getPlatformDomain();
  if (custom) return `${originForHost(custom)}/join-school`;
  if (slug && platform) return `${originForHost(`${slug}.${platform}`)}/join-school`;
  return null;
}

function formatUnlimited(n: number): string {
  return n < 0 ? "unlimited" : String(n);
}

export function registerSchoolTools(server: LmsServer) {
  // ── lms_get_school_settings ─────────────────────────────────────────────────
  server.tool(
    {
      name: "lms_get_school_settings",
      description:
        "Read the school's profile (name, slug, country, logo, plan) and its settings grouped by category (general, enrollment, payment, email), plus the theme kit: what is saved, what actually renders after the plan gate, and the themes/swatches to choose from. Credentials are never returned, only whether they are set. Admin only.",
      inputSchema: z.object({}),
      outputSchema: getSchoolSettingsOutput,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (_input, ctx) => {
      let session: LmsSession;
      try {
        session = adminSession(ctx);
      } catch (err) {
        return errorResult(messageOf(err));
      }

      try {
        const supabase = session.getClient();
        const tenantId = session.getTenantId();
        const [tenantRes, settingsRes, plan] = await Promise.all([
          supabase
            .from("tenants")
            .select("id, name, slug, country, logo_url, domain, plan, status")
            .eq("id", tenantId)
            .maybeSingle(),
          supabase
            .from("tenant_settings")
            .select("setting_key, setting_value")
            .eq("tenant_id", tenantId)
            .order("setting_key"),
          getPlanFeatures(session),
        ]);
        if (tenantRes.error) return errorResult(`Loading school: ${tenantRes.error.message}`);
        if (!tenantRes.data) return errorResult("School not found.");
        if (settingsRes.error) return errorResult(`Loading settings: ${settingsRes.error.message}`);

        const rows = (settingsRes.data ?? []) as { setting_key: string; setting_value: unknown }[];
        const themeRow = rows.find((r) => r.setting_key === SCHOOL_THEME_SETTING_KEY);
        const customBranding = plan?.features?.custom_branding === true;
        const stored = parseStoredKitTheme(themeRow?.setting_value);
        const effective = resolveSchoolTheme(themeRow?.setting_value, { customBranding });
        const t = tenantRes.data;

        const data = {
          school: {
            id: t.id as string,
            name: t.name as string,
            slug: t.slug as string,
            country: (t.country as string | null) ?? null,
            logo_url: (t.logo_url as string | null) ?? null,
            domain: (t.domain as string | null) ?? null,
            plan: (t.plan as string | null) ?? null,
            status: (t.status as string | null) ?? null,
          },
          settings: groupSettings(rows, new Set([SCHOOL_THEME_SETTING_KEY])),
          theme: { stored, effective, custom_branding_allowed: customBranding },
          available_themes: KIT_THEME_IDS.map((id) => ({
            id,
            swatches: kitThemeSwatches(id).map((s) => ({ hex: s.hex, name: s.name })),
          })),
          currencies: [...SCHOOL_CURRENCIES],
        };

        const general = data.settings.general ?? {};
        const siteName = (general.site_name as { value?: unknown } | undefined)?.value;
        const lines = [
          `School "${data.school.name}" (${data.school.slug}) — plan ${data.school.plan ?? "free"}, country ${data.school.country ?? "not set"}.`,
          `Site name: ${typeof siteName === "string" && siteName ? siteName : "(uses the school name)"}.`,
          stored
            ? `Theme: ${stored.theme} ${stored.brand}${
                effective && effective.brand !== stored.brand
                  ? ` (renders ${effective.brand}: custom colours need the custom_branding feature)`
                  : ""
              }.`
            : "Theme: platform palette (no theme saved).",
          `Settings saved: ${rows.length - (themeRow ? 1 : 0)} across ${Object.keys(data.settings).join(", ") || "no categories"}.`,
        ];
        return structured(data, lines.join("\n"));
      } catch (err) {
        return errorResult(messageOf(err));
      }
    }
  );

  // ── lms_update_school_settings ──────────────────────────────────────────────
  server.tool(
    {
      name: "lms_update_school_settings",
      description:
        "Update the school's general and enrollment settings, country and default currency. Only the fields you pass change. Setting a country fills the currency from it only when the school has none yet — an existing currency is never overwritten. The theme is set with lms_set_school_theme; manual_payment_accounts replaces the whole offline-payment account list (normalized, secrets never stored). Payment provider credentials and email (SMTP) settings stay in the dashboard. Admin only.",
      inputSchema: updateSchoolSettingsInput,
      outputSchema: updateSchoolSettingsOutput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input, ctx) => {
      let session: LmsSession;
      try {
        session = adminSession(ctx);
      } catch (err) {
        return errorResult(messageOf(err));
      }

      try {
        const { country: rawCountry, ...settingsInput } = input;
        const built = buildSettingsRows(settingsInput);
        if (!built.ok) return errorResult(built.error);
        const settings: Record<string, SettingValue> = { ...built.settings };

        let country: string | null = null;
        if (rawCountry !== undefined) {
          country = normalizeCountry(rawCountry);
          if (!country) {
            return errorResult(
              `'${rawCountry}' is not an ISO 3166-1 alpha-2 country code (e.g. CO, MX, US).`
            );
          }
        }

        if (country === null && Object.keys(settings).length === 0) {
          return errorResult("Nothing to update — pass at least one field.");
        }

        const supabase = session.getClient();
        const tenantId = session.getTenantId();

        let currencyFilled: string | null = null;
        if (country !== null) {
          const { data: updated, error } = await supabase
            .from("tenants")
            .update({ country })
            .eq("id", tenantId)
            .select("id");
          if (error) return errorResult(`Saving country: ${error.message}`);
          if (!updated || updated.length === 0) {
            return errorResult("The school's country could not be saved (not permitted).");
          }

          // Same rule as updateSchoolCountry (#865): fill a blank currency only.
          const currency = defaultCurrencyForCountry(country);
          if (currency && settings.currency === undefined) {
            const { data: existing, error: readError } = await supabase
              .from("tenant_settings")
              .select("setting_value")
              .eq("tenant_id", tenantId)
              .eq("setting_key", "currency")
              .maybeSingle();
            if (readError) return errorResult(`Reading currency: ${readError.message}`);
            if (isCurrencySettingEmpty(existing?.setting_value)) {
              settings.currency = { value: currency };
              currencyFilled = currency;
            }
          }
        }

        const keys = Object.keys(settings);
        if (keys.length > 0) {
          const rows = keys.map((key) => ({
            tenant_id: tenantId,
            setting_key: key,
            setting_value: settings[key],
          }));
          const { data: saved, error } = await supabase
            .from("tenant_settings")
            .upsert(rows, { onConflict: "tenant_id,setting_key" })
            .select("setting_key");
          if (error) return errorResult(`Saving settings: ${error.message}`);
          if (!saved || saved.length !== rows.length) {
            return errorResult("Some settings could not be saved (not permitted).");
          }
        }

        const parts: string[] = [];
        if (country) parts.push(`country → ${country}`);
        if (currencyFilled) parts.push(`currency filled from the country → ${currencyFilled}`);
        const plain = keys.filter((k) => !(currencyFilled && k === "currency"));
        if (plain.length > 0) parts.push(`updated ${plain.join(", ")}`);

        return structured(
          { updated_keys: keys, country, currency_filled: currencyFilled },
          `School settings saved: ${parts.join("; ")}.`
        );
      } catch (err) {
        return errorResult(messageOf(err));
      }
    }
  );

  // ── lms_set_school_theme ────────────────────────────────────────────────────
  server.tool(
    {
      name: "lms_set_school_theme",
      description:
        "Set the school's look: one of four theme kits (estructura, andina, kodigo, luz) plus a brand colour. Each theme offers six recommended swatches (see lms_get_school_settings → available_themes) that every plan may use; any other #RRGGBB colour needs the custom_branding plan feature. Pass reset: true to go back to the platform palette. Admin only.",
      inputSchema: setSchoolThemeInput,
      outputSchema: setSchoolThemeOutput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input, ctx) => {
      let session: LmsSession;
      try {
        session = adminSession(ctx);
      } catch (err) {
        return errorResult(messageOf(err));
      }

      try {
        const supabase = session.getClient();
        const tenantId = session.getTenantId();

        if (input.reset) {
          if (input.theme || input.brand) {
            return errorResult("Pass either reset: true or a theme, not both.");
          }
          const { error } = await supabase
            .from("tenant_settings")
            .delete()
            .eq("tenant_id", tenantId)
            .eq("setting_key", SCHOOL_THEME_SETTING_KEY);
          if (error) return errorResult(`Resetting theme: ${error.message}`);
          invalidateBranding(tenantId);
          return structured(
            { theme: null, custom: false },
            "Theme removed — the school now renders the platform palette."
          );
        }

        if (!input.theme) {
          return errorResult("Choose a theme (estructura, andina, kodigo, luz), or pass reset: true.");
        }

        const swatches = kitThemeSwatches(input.theme);
        const stored = parseStoredKitTheme({
          type: "kit",
          theme: input.theme,
          brand: input.brand ?? swatches[0].hex,
        });
        if (!stored) return errorResult("Invalid theme or colour.");

        // Same gate as applyKitTheme (#763): a colour outside the theme's
        // swatches is custom branding.
        const custom = !isKitSwatch(stored.theme, stored.brand);
        if (custom) {
          const plan = await getPlanFeatures(session);
          if (plan?.features?.custom_branding !== true) {
            return errorResult(
              `${stored.brand} is a custom colour, which needs the custom_branding feature (Business plan or above). On this plan pick one of ${stored.theme}'s swatches: ${swatches
                .map((s) => `${s.hex} (${s.name})`)
                .join(", ")}.`
            );
          }
        }

        const { error } = await supabase
          .from("tenant_settings")
          .upsert(
            { tenant_id: tenantId, setting_key: SCHOOL_THEME_SETTING_KEY, setting_value: stored },
            { onConflict: "tenant_id,setting_key" }
          );
        if (error) return errorResult(`Saving theme: ${error.message}`);
        invalidateBranding(tenantId);

        const swatchName = swatches.find((s) => s.hex === stored.brand)?.name;
        return structured(
          { theme: stored, custom },
          `Theme set to ${stored.theme} with ${stored.brand}${swatchName ? ` (${swatchName})` : " (custom colour)"}.`
        );
      } catch (err) {
        return errorResult(messageOf(err));
      }
    }
  );

  // ── lms_list_school_members ─────────────────────────────────────────────────
  server.tool(
    {
      name: "lms_list_school_members",
      description:
        "List the school's members with their role and membership status (active by default; banned/removed/all on request), newest first, optionally with pending invitations. Email addresses are not available here. Admin only.",
      inputSchema: listMembersInput,
      outputSchema: listMembersOutput,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input, ctx) => {
      let session: LmsSession;
      try {
        session = adminSession(ctx);
      } catch (err) {
        return errorResult(messageOf(err));
      }

      try {
        const supabase = session.getClient();
        const tenantId = session.getTenantId();
        const limit = input.limit ?? 50;
        const offset = input.offset ?? 0;
        const status = input.status ?? "active";

        let query = supabase
          .from("tenant_users")
          .select("user_id, role, status, joined_at", { count: "exact" })
          .eq("tenant_id", tenantId);
        if (input.role) query = query.eq("role", input.role);
        if (status !== "all") query = query.eq("status", status);
        const { data: memberRows, error, count } = await query
          .order("joined_at", { ascending: false, nullsFirst: false })
          .range(offset, offset + limit - 1);
        if (error) return errorResult(`Loading members: ${error.message}`);

        const rows = (memberRows ?? []) as {
          user_id: string;
          role: string;
          status: string;
          joined_at: string | null;
        }[];

        // profiles is global (no tenant_id) and public-readable; the ids come
        // from this tenant's membership rows, which is the tenant scope.
        const names = new Map<string, string | null>();
        if (rows.length > 0) {
          const { data: profiles, error: profileError } = await supabase
            .from("profiles")
            .select("id, full_name")
            .in(
              "id",
              rows.map((r) => r.user_id)
            );
          if (profileError) return errorResult(`Loading profiles: ${profileError.message}`);
          for (const p of profiles ?? []) names.set(p.id as string, (p.full_name as string | null) ?? null);
        }

        const members = rows.map((r) => ({
          user_id: r.user_id,
          full_name: names.get(r.user_id) ?? null,
          role: r.role,
          status: r.status,
          joined_at: r.joined_at ?? null,
        }));

        let invitations:
          | { id: string; email: string; role: string; created_at: string }[]
          | undefined;
        let invitationsTotal: number | undefined;
        if (input.include_invitations) {
          const {
            data: invites,
            error: inviteError,
            count: inviteCount,
          } = await supabase
            .from("tenant_invitations")
            .select("id, email, role, created_at", { count: "exact" })
            .eq("tenant_id", tenantId)
            .eq("status", "pending")
            .order("created_at", { ascending: false })
            .limit(100);
          if (inviteError) return errorResult(`Loading invitations: ${inviteError.message}`);
          invitations = (invites ?? []).map((i) => ({
            id: i.id as string,
            email: i.email as string,
            role: i.role as string,
            created_at: i.created_at as string,
          }));
          invitationsTotal = inviteCount ?? invitations.length;
        }

        const total = count ?? members.length;
        const lines = [
          `${total} ${status === "all" ? "" : `${status} `}member(s)${input.role ? ` with role ${input.role}` : ""}; showing ${members.length} from offset ${offset}.`,
          ...members.map(
            (m) => `- ${m.full_name ?? "(no name)"} — ${m.role}${m.status !== "active" ? ` [${m.status}]` : ""} (${m.user_id})`
          ),
        ];
        if (invitations) {
          const shown = invitationsTotal !== undefined && invitationsTotal > invitations.length
            ? ` (showing the newest ${invitations.length})`
            : "";
          lines.push(`${invitationsTotal ?? invitations.length} pending invitation(s)${shown}.`);
          for (const i of invitations) lines.push(`- ${i.email} — ${i.role}`);
        }

        const data: z.infer<typeof listMembersOutput> = { total, members };
        if (invitations) {
          data.invitations = invitations;
          data.invitations_total = invitationsTotal ?? invitations.length;
        }
        return structured(data, lines.join("\n"));
      } catch (err) {
        return errorResult(messageOf(err));
      }
    }
  );

  // ── lms_change_member_role ──────────────────────────────────────────────────
  server.tool(
    {
      name: "lms_change_member_role",
      description:
        "Change an active member's role in this school (student, teacher or admin). Refuses to demote the last admin, refuses banned or removed members, and respects the plan's student limit when making someone a student. The member sees the new role after their session refreshes. Admin only.",
      inputSchema: changeMemberRoleInput,
      outputSchema: changeMemberRoleOutput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input, ctx) => {
      let session: LmsSession;
      try {
        session = adminSession(ctx);
      } catch (err) {
        return errorResult(messageOf(err));
      }

      try {
        const supabase = session.getClient();
        const tenantId = session.getTenantId();

        const { data: member, error: memberError } = await supabase
          .from("tenant_users")
          .select("role, status")
          .eq("tenant_id", tenantId)
          .eq("user_id", input.user_id)
          .maybeSingle();
        if (memberError) return errorResult(`Loading member: ${memberError.message}`);
        if (!member) return errorResult("That user is not a member of this school.");
        if (member.status === "banned") return errorResult(BANNED_MESSAGE);
        if (member.status !== "active") {
          return errorResult(
            `That member's status is '${member.status}'. They must rejoin the school before their role can change.`
          );
        }

        const previous = member.role as string;
        if (previous === input.role) {
          return structured(
            { user_id: input.user_id, previous_role: previous, role: previous, changed: false },
            `No change — the member is already ${previous}.`
          );
        }

        // Same guard as updateUserRoles: a school must keep an admin.
        if (previous === "admin") {
          const { count, error: countError } = await supabase
            .from("tenant_users")
            .select("user_id", { count: "exact", head: true })
            .eq("tenant_id", tenantId)
            .eq("role", "admin")
            .eq("status", "active");
          if (countError) return errorResult(`Counting admins: ${countError.message}`);
          if ((count ?? 0) <= 1) {
            return errorResult("Cannot remove the last admin. Promote another member to admin first.");
          }
        }

        // An active member becoming a student takes a seat (#658). The
        // trigger decides the race; this is for the nicer message.
        if (input.role === "student") {
          const headroom = await studentLimitHeadroomError(supabase, tenantId);
          if (headroom) return errorResult(headroom);
        }

        const { data: updated, error } = await supabase
          .from("tenant_users")
          .update({ role: input.role })
          .eq("tenant_id", tenantId)
          .eq("user_id", input.user_id)
          .select("role");
        if (error) {
          if (isPlanLimitError(error)) {
            return errorResult(await planLimitMessage(supabase, tenantId, "students"));
          }
          if ((error as { code?: string }).code === TENANT_BANNED_SQLSTATE) {
            return errorResult(BANNED_MESSAGE);
          }
          return errorResult(`Changing role: ${error.message}`);
        }
        if (!updated || updated.length === 0) {
          return errorResult("The role could not be changed (not permitted).");
        }

        const self = input.user_id === session.getUserId();
        return structured(
          { user_id: input.user_id, previous_role: previous, role: input.role, changed: true },
          `Role changed from ${previous} to ${input.role}.${
            self ? " This is your own membership — your current session keeps its old role until it refreshes." : " It applies on the member's next sign-in or session refresh."
          }`
        );
      } catch (err) {
        return errorResult(messageOf(err));
      }
    }
  );

  // ── lms_invite_member ───────────────────────────────────────────────────────
  server.tool(
    {
      name: "lms_invite_member",
      description:
        "Invite someone to the school as a student or teacher. Records the invitation so they get that role when they join with this email, and returns the school's join link to share — no email is sent from here. Requires a verified email on the admin's account. Admin only.",
      inputSchema: inviteMemberInput,
      outputSchema: inviteMemberOutput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (input, ctx) => {
      let session: LmsSession;
      try {
        session = adminSession(ctx);
      } catch (err) {
        return errorResult(messageOf(err));
      }

      try {
        const supabase = session.getClient();
        const tenantId = session.getTenantId();
        const email = input.email.trim().toLowerCase();
        const role = input.role ?? "student";

        // Same gate as createInvitation (#436): invitations need a verified sender.
        const { data: me, error: meError } = await supabase.auth.getUser(session.getAccessToken());
        if (meError) return errorResult(`Checking your account: ${meError.message}`);
        if (!me.user?.email_confirmed_at) {
          return errorResult(
            "Please verify your email address before sending invitations. Check your inbox for the confirmation link."
          );
        }

        const { data: pending, error: pendingError } = await supabase
          .from("tenant_invitations")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("email", email)
          .eq("status", "pending")
          .maybeSingle();
        if (pendingError) return errorResult(`Checking invitations: ${pendingError.message}`);
        if (pending) return errorResult("An invitation is already pending for this email.");

        const { data: created, error } = await supabase
          .from("tenant_invitations")
          .insert({ tenant_id: tenantId, email, role, invited_by: session.getUserId() })
          .select("id")
          .single();
        if (error) {
          if ((error as { code?: string }).code === "23505") {
            return errorResult("An invitation is already pending for this email.");
          }
          return errorResult(`Creating invitation: ${error.message}`);
        }

        // Inviting does not take a seat; joining does, and the join is refused
        // at the cap. Say so now rather than leave the invitee to find out.
        let studentLimitReached = false;
        if (role === "student") {
          const usage = await getTenantPlanUsage(supabase, tenantId);
          studentLimitReached =
            !!usage && usage.max_students >= 0 && usage.students >= usage.max_students;
        }

        const joinUrl = await joinUrlFor(session);
        const lines = [
          `Invitation recorded for ${email} as ${role}. No email was sent — share the join link${
            joinUrl ? `: ${joinUrl}` : " from the dashboard (Users → Invite)"
          }. When they sign in with this email and join, they get the ${role} role.`,
        ];
        if (studentLimitReached) {
          lines.push(
            "Warning: the school is at its plan's student limit, so this person cannot join as a student until a seat frees up or the plan is upgraded."
          );
        }

        return structured(
          {
            invitation_id: created.id as string,
            email,
            role,
            join_url: joinUrl,
            email_sent: false,
            student_limit_reached: studentLimitReached,
          },
          lines.join("\n")
        );
      } catch (err) {
        return errorResult(messageOf(err));
      }
    }
  );

  // ── lms_get_plan_usage ──────────────────────────────────────────────────────
  server.tool(
    {
      name: "lms_get_plan_usage",
      description:
        "Show the school's platform plan: which features it includes, its limits, the platform transaction fee, and current usage against the course and student caps (-1 = unlimited). Use it before creating courses or inviting students in bulk. Admin only.",
      inputSchema: z.object({}),
      outputSchema: planUsageOutput,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (_input, ctx) => {
      let session: LmsSession;
      try {
        session = adminSession(ctx);
      } catch (err) {
        return errorResult(messageOf(err));
      }

      try {
        const [plan, usage] = await Promise.all([
          getPlanFeatures(session),
          getTenantPlanUsage(session.getClient(), session.getTenantId()),
        ]);
        const fee =
          plan?.transaction_fee_percent === null || plan?.transaction_fee_percent === undefined
            ? null
            : Number(plan.transaction_fee_percent);
        const features = plan?.features ?? {};

        const data = {
          plan: plan?.plan ?? null,
          plan_name: plan?.plan_name ?? null,
          transaction_fee_percent: Number.isFinite(fee) ? fee : null,
          features,
          limits: plan?.limits ?? {},
          usage,
        };

        const included = Object.entries(features)
          .filter(([, v]) => v === true)
          .map(([k]) => k);
        const lines = [
          `Plan: ${data.plan_name ?? data.plan ?? "unknown"}${
            data.transaction_fee_percent !== null ? ` — platform fee ${data.transaction_fee_percent}%` : ""
          }.`,
          usage
            ? `Usage: ${usage.courses}/${formatUnlimited(usage.max_courses)} courses, ${usage.students}/${formatUnlimited(usage.max_students)} students.`
            : "Usage: unavailable.",
          `Features included: ${included.length > 0 ? included.join(", ") : "none"}.`,
        ];
        return structured(data, lines.join("\n"));
      } catch (err) {
        return errorResult(messageOf(err));
      }
    }
  );
}
