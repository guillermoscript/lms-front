/**
 * School-level tools (#898): role gating, input schemas, the pure helpers, and
 * the guards inside the write handlers.
 *
 * The handlers run against a scripted fake of the request-scoped Supabase
 * client (`createUserClient` is mocked), so each test pins what a tool sends
 * and what it refuses without an OAuth session or a database. RLS and the
 * plan-limit / ban triggers stay the real enforcement; these tests cover the
 * app-side guards and the error mapping on top of them.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as rootCountries from "../../lib/countries";
import * as rootGeneral from "../../lib/settings/general-settings";

type Result = { data?: unknown; error?: unknown; count?: number | null };
type Op = [string, ...unknown[]];

interface FakeCall {
  table: string;
  ops: Op[];
}

let fake: ReturnType<typeof makeFake>;

function makeFake(
  script: Record<string, Result[]>,
  rpcs: Record<string, Result> = {},
  user: { email_confirmed_at?: string | null } = { email_confirmed_at: "2026-01-01T00:00:00Z" }
) {
  const calls: FakeCall[] = [];
  const next = (table: string): Result => {
    const r = script[table]?.shift() ?? { data: null, error: null };
    return { data: r.data ?? null, error: r.error ?? null, count: r.count ?? null };
  };
  const from = (table: string) => {
    const call: FakeCall = { table, ops: [] };
    calls.push(call);
    const chain: Record<string, unknown> = {};
    for (const m of [
      "select", "eq", "in", "not", "order", "range", "limit",
      "update", "insert", "upsert", "delete",
    ]) {
      chain[m] = (...args: unknown[]) => {
        call.ops.push([m, ...args]);
        return chain;
      };
    }
    chain.maybeSingle = () => Promise.resolve(next(table));
    chain.single = () => Promise.resolve(next(table));
    chain.then = (res: (v: Result) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve(next(table)).then(res, rej);
    return chain;
  };
  const rpc = vi.fn(async (name: string) => {
    const r = rpcs[name] ?? {};
    return { data: r.data ?? null, error: r.error ?? null };
  });
  const auth = {
    getUser: vi.fn(async () => ({ data: { user: { id: "me", ...user } }, error: null })),
  };
  return { client: { from, rpc, auth }, calls, rpc };
}

vi.mock("../src/supabase.js", () => ({
  createUserClient: () => fake.client,
  getServiceClient: () => null,
}));

const { isToolAllowedForRole } = await import("../src/tool-policy.js");
const school = await import("../src/tools/school.js");
const notifications = await import("../src/tools/notifications.js");
const settingsLib = await import("../src/school-settings.js");
const { studentLimitHeadroomError } = await import("../src/plan-limits.js");

type Handler = (input: unknown, ctx: unknown) => Promise<{
  isError?: boolean;
  content?: { text?: string }[];
  structuredContent?: Record<string, unknown>;
}>;

function collect(register: (s: never) => void): Map<string, Handler> {
  const handlers = new Map<string, Handler>();
  register({
    tool: (def: { name: string }, cb: Handler) => {
      handlers.set(def.name, cb);
      return { name: def.name };
    },
  } as never);
  return handlers;
}

const schoolTools = collect(school.registerSchoolTools);
const selfTools = collect(notifications.registerNotificationTools);

const TENANT = "00000000-0000-0000-0000-000000000001";
const ME = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";

function ctxFor(role: string) {
  return {
    auth: {
      user: { id: ME },
      accessToken: "token",
      payload: { tenant_id: TENANT, tenant_role: role },
    },
  };
}

const textOf = (r: { content?: { text?: string }[] }) => r.content?.[0]?.text ?? "";
const opNames = (c: FakeCall) => c.ops.map((o) => o[0]);

const ADMIN_TOOLS = [
  "lms_get_school_settings",
  "lms_update_school_settings",
  "lms_set_school_theme",
  "lms_list_school_members",
  "lms_change_member_role",
  "lms_invite_member",
  "lms_get_plan_usage",
];
const SELF_TOOLS = ["lms_my_notifications", "lms_mark_notifications_read", "lms_my_league"];

describe("tool policy (#898)", () => {
  it("registers every tool it gates", () => {
    expect([...schoolTools.keys()].sort()).toEqual([...ADMIN_TOOLS].sort());
    expect([...selfTools.keys()].sort()).toEqual([...SELF_TOOLS].sort());
  });

  it("school administration is admin-only", () => {
    for (const name of ADMIN_TOOLS) {
      expect(isToolAllowedForRole("admin", name)).toBe(true);
      expect(isToolAllowedForRole("teacher", name)).toBe(false);
      expect(isToolAllowedForRole("student", name)).toBe(false);
      expect(isToolAllowedForRole(undefined, name)).toBe(false);
    }
  });

  it("notifications and league are open to every member role", () => {
    for (const name of SELF_TOOLS) {
      for (const role of ["admin", "teacher", "student"]) {
        expect(isToolAllowedForRole(role, name)).toBe(true);
      }
      expect(isToolAllowedForRole(undefined, name)).toBe(false);
    }
  });
});

describe("input schemas", () => {
  it("member ids accept the seeded non-v4 uuids and refuse junk", () => {
    expect(school.changeMemberRoleInput.safeParse({ user_id: TENANT, role: "teacher" }).success).toBe(true);
    expect(school.changeMemberRoleInput.safeParse({ user_id: "abc", role: "teacher" }).success).toBe(false);
    expect(school.changeMemberRoleInput.safeParse({ user_id: TENANT, role: "owner" }).success).toBe(false);
  });

  it("invitations are student or teacher only, with a real email", () => {
    expect(school.inviteMemberInput.parse({ email: "a@b.co" }).role).toBe("student");
    expect(school.inviteMemberInput.safeParse({ email: "a@b.co", role: "admin" }).success).toBe(false);
    expect(school.inviteMemberInput.safeParse({ email: "not-an-email" }).success).toBe(false);
  });

  it("theme brand must be #RRGGBB and theme a kit id", () => {
    expect(school.setSchoolThemeInput.safeParse({ theme: "andina", brand: "#2f6b4f" }).success).toBe(true);
    expect(school.setSchoolThemeInput.safeParse({ theme: "andina", brand: "red" }).success).toBe(false);
    expect(school.setSchoolThemeInput.safeParse({ theme: "neon" }).success).toBe(false);
  });

  it("settings input has no theme or credential fields", () => {
    const keys = Object.keys(school.updateSchoolSettingsInput.shape);
    expect(keys).not.toContain("theme_preset");
    expect(keys.some((k) => /password|secret|smtp|stripe/i.test(k))).toBe(false);
  });

  it("member listing and notification limits are bounded", () => {
    expect(school.listMembersInput.safeParse({ limit: 101 }).success).toBe(false);
    expect(school.listMembersInput.parse({}).status).toBe("active");
    expect(notifications.myNotificationsInput.safeParse({ limit: 51 }).success).toBe(false);
    expect(notifications.markNotificationsReadInput.safeParse({ notification_ids: [] }).success).toBe(false);
  });
});

describe("settings helpers mirror the app (lib/countries, lib/settings/general-settings)", () => {
  it("country codes and currency map are identical", () => {
    expect([...settingsLib.COUNTRY_CODES]).toEqual([...rootCountries.COUNTRY_CODES]);
    expect(settingsLib.COUNTRY_CURRENCY).toEqual(rootCountries.COUNTRY_CURRENCY);
    expect([...settingsLib.SCHOOL_CURRENCIES]).toEqual([...rootCountries.SCHOOL_CURRENCIES]);
  });

  it("normalizers agree", () => {
    for (const input of ["co", " CO ", "XX", "T1", "", 5, null]) {
      expect(settingsLib.normalizeCountry(input)).toBe(rootCountries.normalizeCountry(input));
    }
    for (const v of [undefined, null, {}, { value: "" }, { value: " " }, { value: "USD" }]) {
      expect(settingsLib.isCurrencySettingEmpty(v)).toBe(rootCountries.isCurrencySettingEmpty(v));
    }
    for (const raw of [null, undefined, "", "  ", "a@b.co", " a@b.co ", "nope", 3]) {
      expect(settingsLib.normalizeOptionalEmail(raw)).toEqual(rootGeneral.normalizeOptionalEmail(raw));
    }
    expect(settingsLib.MAX_SITE_NAME_LENGTH).toBe(rootGeneral.MAX_SITE_NAME_LENGTH);
  });
});

describe("buildSettingsRows", () => {
  it("applies the #890 general-settings gate", () => {
    const out = settingsLib.buildSettingsRows({
      site_name: "  ",
      contact_email: " hi@school.co ",
      support_email: "",
    });
    expect(out).toEqual({
      ok: true,
      settings: {
        site_name: { value: null },
        contact_email: { value: "hi@school.co" },
        support_email: { value: null },
      },
    });
  });

  it("refuses a bad email, time zone, currency or URL", () => {
    expect(settingsLib.buildSettingsRows({ contact_email: "x" }).ok).toBe(false);
    expect(settingsLib.buildSettingsRows({ timezone: "Mars/Olympus" }).ok).toBe(false);
    expect(settingsLib.buildSettingsRows({ currency: "XYZ" }).ok).toBe(false);
    expect(settingsLib.buildSettingsRows({ logo_url: "javascript:alert(1)" }).ok).toBe(false);
    expect(settingsLib.buildSettingsRows({ site_name: "x".repeat(121) }).ok).toBe(false);
  });

  it("stores flags as { enabled } and numbers as { value }", () => {
    const out = settingsLib.buildSettingsRows({
      free_preview_enabled: false,
      enrollment_expiration_days: 30,
      currency: "cop",
      timezone: "America/Bogota",
      logo_url: "",
    });
    expect(out).toEqual({
      ok: true,
      settings: {
        free_preview_enabled: { enabled: false },
        enrollment_expiration_days: { value: 30 },
        currency: { value: "COP" },
        timezone: { value: "America/Bogota" },
        logo_url: { value: "" },
      },
    });
  });

  it("groups settings and never returns a credential", () => {
    const grouped = settingsLib.groupSettings(
      [
        { setting_key: "site_name", setting_value: { value: "Acme" } },
        { setting_key: "smtp_password", setting_value: { value: "hunter2" } },
        { setting_key: "theme_preset", setting_value: { type: "kit" } },
      ],
      new Set(["theme_preset"])
    );
    expect(grouped.general.site_name).toEqual({ value: "Acme" });
    expect(grouped.email.smtp_password).toEqual({ redacted: true, set: true });
    expect(JSON.stringify(grouped)).not.toContain("hunter2");
    expect(JSON.stringify(grouped)).not.toContain("theme_preset");
  });
});

describe("studentLimitHeadroomError", () => {
  it("refuses at the cap and allows with headroom or unlimited", async () => {
    const at = makeFake({}, { get_tenant_plan_usage: { data: { students: 50, max_students: 50 } } });
    expect(await studentLimitHeadroomError(at.client as never, TENANT)).toContain("limited to 50 students");
    const room = makeFake({}, { get_tenant_plan_usage: { data: { students: 3, max_students: 50 } } });
    expect(await studentLimitHeadroomError(room.client as never, TENANT)).toBeNull();
    const unl = makeFake({}, { get_tenant_plan_usage: { data: { students: 9999, max_students: -1 } } });
    expect(await studentLimitHeadroomError(unl.client as never, TENANT)).toBeNull();
  });
});

describe("lms_change_member_role", () => {
  const run = (input: unknown, role = "admin") =>
    schoolTools.get("lms_change_member_role")!(input, ctxFor(role));

  beforeEach(() => {
    fake = makeFake({});
  });

  it("refuses a non-admin caller in the handler too", async () => {
    const r = await run({ user_id: OTHER, role: "teacher" }, "teacher");
    expect(r.isError).toBe(true);
    expect(fake.calls).toHaveLength(0);
  });

  it("refuses to demote the last admin", async () => {
    fake = makeFake({
      tenant_users: [{ data: { role: "admin", status: "active" } }, { count: 1 }],
    });
    const r = await run({ user_id: OTHER, role: "teacher" });
    expect(r.isError).toBe(true);
    expect(textOf(r)).toContain("last admin");
    expect(fake.calls.some((c) => opNames(c).includes("update"))).toBe(false);
  });

  it("refuses a banned member", async () => {
    fake = makeFake({ tenant_users: [{ data: { role: "student", status: "banned" } }] });
    const r = await run({ user_id: OTHER, role: "teacher" });
    expect(r.isError).toBe(true);
    expect(textOf(r)).toContain("banned");
  });

  it("pre-checks the student limit before writing", async () => {
    fake = makeFake(
      { tenant_users: [{ data: { role: "teacher", status: "active" } }] },
      { get_tenant_plan_usage: { data: { students: 50, max_students: 50 } } }
    );
    const r = await run({ user_id: OTHER, role: "student" });
    expect(r.isError).toBe(true);
    expect(textOf(r)).toContain("limited to 50 students");
    expect(fake.calls.some((c) => opNames(c).includes("update"))).toBe(false);
  });

  it("maps the trigger's LM001 to the upgrade message", async () => {
    fake = makeFake(
      {
        tenant_users: [
          { data: { role: "teacher", status: "active" } },
          { error: { code: "LM001", message: "plan_limit_exceeded:students" } },
        ],
      },
      { get_tenant_plan_usage: { data: { students: 49, max_students: 50 } } }
    );
    const r = await run({ user_id: OTHER, role: "student" });
    expect(r.isError).toBe(true);
    expect(textOf(r)).toContain("limited to 50 students");
  });

  it("writes tenant_users.role scoped to the tenant and the member", async () => {
    fake = makeFake({
      tenant_users: [{ data: { role: "student", status: "active" } }, { data: [{ role: "teacher" }] }],
    });
    const r = await run({ user_id: OTHER, role: "teacher" });
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent).toEqual({
      user_id: OTHER,
      previous_role: "student",
      role: "teacher",
      changed: true,
    });
    const update = fake.calls.find((c) => opNames(c).includes("update"))!;
    expect(update.table).toBe("tenant_users");
    expect(update.ops).toContainEqual(["update", { role: "teacher" }]);
    expect(update.ops).toContainEqual(["eq", "tenant_id", TENANT]);
    expect(update.ops).toContainEqual(["eq", "user_id", OTHER]);
  });
});

describe("lms_set_school_theme", () => {
  const run = (input: unknown) => schoolTools.get("lms_set_school_theme")!(input, ctxFor("admin"));

  it("refuses a custom colour without custom_branding", async () => {
    fake = makeFake({}, { get_plan_features: { data: { features: { custom_branding: false } } } });
    const r = await run({ theme: "estructura", brand: "#123456" });
    expect(r.isError).toBe(true);
    expect(textOf(r)).toContain("custom_branding");
    expect(textOf(r)).toContain("#3A50B8");
    expect(fake.calls).toHaveLength(0);
  });

  it("saves a swatch on any plan, defaulting to the recommended one", async () => {
    fake = makeFake({ tenant_settings: [{ data: null }] });
    const r = await run({ theme: "luz" });
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent).toEqual({
      theme: { type: "kit", theme: "luz", brand: "#C2185B" },
      custom: false,
    });
    expect(fake.rpc).not.toHaveBeenCalled();
    const upsert = fake.calls[0];
    expect(upsert.ops[0]).toEqual([
      "upsert",
      {
        tenant_id: TENANT,
        setting_key: "theme_preset",
        setting_value: { type: "kit", theme: "luz", brand: "#C2185B" },
      },
      { onConflict: "tenant_id,setting_key" },
    ]);
  });
});

describe("lms_update_school_settings", () => {
  const run = (input: unknown) =>
    schoolTools.get("lms_update_school_settings")!(input, ctxFor("admin"));

  it("fills a blank currency from the country, like updateSchoolCountry", async () => {
    fake = makeFake({
      tenants: [{ data: [{ id: TENANT }] }],
      tenant_settings: [{ data: null }, { data: [{ setting_key: "currency" }] }],
    });
    const r = await run({ country: "co" });
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent).toEqual({
      updated_keys: ["currency"],
      country: "CO",
      currency_filled: "COP",
    });
    const tenantUpdate = fake.calls.find((c) => c.table === "tenants")!;
    expect(tenantUpdate.ops).toContainEqual(["update", { country: "CO" }]);
    expect(tenantUpdate.ops).toContainEqual(["eq", "id", TENANT]);
  });

  it("never overwrites a chosen currency", async () => {
    fake = makeFake({
      tenants: [{ data: [{ id: TENANT }] }],
      tenant_settings: [{ data: { setting_value: { value: "USD" } } }],
    });
    const r = await run({ country: "MX" });
    expect(r.structuredContent).toEqual({ updated_keys: [], country: "MX", currency_filled: null });
  });

  it("refuses an empty update and an unknown country before touching the database", async () => {
    fake = makeFake({});
    expect((await run({})).isError).toBe(true);
    expect((await run({ country: "XX" })).isError).toBe(true);
    expect(fake.calls).toHaveLength(0);
  });
});

describe("league shaping", () => {
  it("flattens the not-in-league branch", () => {
    const out = notifications.shapeLeague({ in_league: false, reason: "opted_out" });
    expect(out.in_league).toBe(false);
    expect(out.reason).toBe("opted_out");
    expect(out.standings).toEqual([]);
    expect(notifications.myLeagueOutput.safeParse(out).success).toBe(true);
  });

  it("keeps rank, XP and the zone, and passes the output schema", () => {
    const out = notifications.shapeLeague({
      in_league: true,
      reason: null,
      week_start: "2026-09-28",
      week_end: "2026-10-05",
      tier: { tier: 2, slug: "silver", name: "Silver", max_tier: 5 },
      promote_count: 3,
      demote_count: 2,
      cohort_size: 20,
      active_size: 12,
      standings: [
        { user_id: ME, full_name: "Me", avatar_url: null, weekly_xp: 120, rank: 1, is_me: true, zone: "promote" },
        { user_id: OTHER, full_name: null, avatar_url: null, weekly_xp: 10, rank: 2, is_me: false },
      ],
    });
    expect(out.standings[1].zone).toBeNull();
    expect(notifications.myLeagueOutput.safeParse(out).success).toBe(true);
    expect(notifications.describeLeague(out)).toContain("You are #1 of 20 with 120 XP");
  });
});

describe("lms_mark_notifications_read", () => {
  const run = (input: unknown) =>
    selfTools.get("lms_mark_notifications_read")!(input, ctxFor("student"));

  it("needs exactly one of ids or all", async () => {
    fake = makeFake({});
    expect((await run({})).isError).toBe(true);
    expect((await run({ notification_ids: [1], all: true })).isError).toBe(true);
    expect(fake.calls).toHaveLength(0);
  });

  it("marks only the caller's unread rows in this school", async () => {
    fake = makeFake({
      user_notifications: [{ data: [{ id: 7 }] }, { data: [{ id: 7 }] }],
    });
    const r = await run({ notification_ids: [7, 8] });
    expect(r.structuredContent).toEqual({ marked: 1 });
    const [read, write] = fake.calls;
    expect(read.ops).toContainEqual(["eq", "user_id", ME]);
    expect(read.ops).toContainEqual(["eq", "notification.tenant_id", TENANT]);
    expect(write.ops).toContainEqual(["in", "id", [7]]);
    expect(write.ops).toContainEqual(["eq", "user_id", ME]);
    const update = write.ops.find((o) => o[0] === "update")![1] as Record<string, unknown>;
    expect(Object.keys(update).sort()).toEqual(["in_app_read", "in_app_read_at"]);
  });
});
