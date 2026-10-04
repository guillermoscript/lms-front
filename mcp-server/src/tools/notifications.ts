import { z } from "zod";
import { getLeagueStandings } from "@lms/core";
import type { LmsServer } from "../server-types.js";
import { LmsSession } from "../session.js";
import { errorResult, structured } from "../format.js";

/**
 * Self-scoped school-life tools (#898): the caller's notifications in this
 * school and their weekly league. Students, teachers and admins may all call
 * them — "my" is always the caller.
 *
 * Notifications read exactly what the web notifications page reads (#870):
 * the caller's `user_notifications` rows joined `!inner` to `notifications`
 * filtered by this tenant, dismissed rows skipped. Marking read writes only
 * `in_app_read` / `in_app_read_at`, the columns the authenticated grant
 * allows, on the caller's own rows. The league is the `get_league_standings`
 * RPC (#394/#830), which scopes itself with `auth.uid()` + `get_tenant_id()`.
 */

/** Rows marked read per round trip — same bounds as markAllNotificationsAsRead. */
const MARK_ALL_BATCH = 200;
const MARK_ALL_MAX_BATCHES = 50;

export const myNotificationsInput = z.object({
  unread_only: z.boolean().default(false).describe("Only notifications not yet read"),
  limit: z.number().int().min(1).max(50).default(20).describe("Max notifications to return"),
});

export const myNotificationsOutput = z.object({
  unread_count: z.number(),
  notifications: z.array(
    z.object({
      id: z.number().describe("Delivery id — pass it to lms_mark_notifications_read"),
      read: z.boolean(),
      created_at: z.string(),
      title: z.string(),
      content: z.string(),
      type: z.string(),
      priority: z.string(),
    })
  ),
});

export const markNotificationsReadInput = z.object({
  notification_ids: z
    .array(z.number().int())
    .min(1)
    .max(200)
    .optional()
    .describe("Delivery ids from lms_my_notifications"),
  all: z
    .boolean()
    .optional()
    .describe("true marks every unread notification in this school as read"),
});

export const markNotificationsReadOutput = z.object({
  marked: z.number(),
});

const standingSchema = z.object({
  rank: z.number(),
  user_id: z.string(),
  full_name: z.string().nullable(),
  weekly_xp: z.number(),
  is_me: z.boolean(),
  zone: z.enum(["promote", "demote"]).nullable(),
});

export const myLeagueOutput = z.object({
  in_league: z.boolean(),
  reason: z.string().nullable().describe("no_league or opted_out when not in a league"),
  week_start: z.string().nullable(),
  week_end: z.string().nullable(),
  tier: z
    .object({ tier: z.number(), slug: z.string(), name: z.string(), max_tier: z.number() })
    .nullable(),
  promote_count: z.number().nullable(),
  demote_count: z.number().nullable(),
  cohort_size: z.number().nullable(),
  standings: z.array(standingSchema),
});

type LeagueOutput = z.infer<typeof myLeagueOutput>;

/** Flatten the RPC's union into the one shape the output schema declares. */
export function shapeLeague(raw: unknown): LeagueOutput {
  const r = (raw ?? {}) as Record<string, unknown>;
  if (r.in_league !== true) {
    return {
      in_league: false,
      reason: typeof r.reason === "string" ? r.reason : "no_league",
      week_start: null,
      week_end: null,
      tier: null,
      promote_count: null,
      demote_count: null,
      cohort_size: null,
      standings: [],
    };
  }
  const tier = r.tier as LeagueOutput["tier"] | undefined;
  const num = (v: unknown): number | null => (typeof v === "number" ? v : null);
  return {
    in_league: true,
    reason: null,
    week_start: typeof r.week_start === "string" ? r.week_start : null,
    week_end: typeof r.week_end === "string" ? r.week_end : null,
    tier: tier
      ? { tier: tier.tier, slug: tier.slug, name: tier.name, max_tier: tier.max_tier }
      : null,
    promote_count: num(r.promote_count),
    demote_count: num(r.demote_count),
    cohort_size: num(r.cohort_size),
    standings: ((r.standings as Record<string, unknown>[] | undefined) ?? []).map((s) => ({
      rank: Number(s.rank ?? 0),
      user_id: String(s.user_id ?? ""),
      full_name: typeof s.full_name === "string" ? s.full_name : null,
      weekly_xp: Number(s.weekly_xp ?? 0),
      is_me: s.is_me === true,
      zone: s.zone === "promote" || s.zone === "demote" ? s.zone : null,
    })),
  };
}

export function describeLeague(league: LeagueOutput): string {
  if (!league.in_league) {
    return league.reason === "opted_out"
      ? "You have opted out of leagues in this school."
      : "You are not in a league yet — earn XP this week to be placed in one.";
  }
  const me = league.standings.find((s) => s.is_me);
  const lines = [
    `${league.tier?.name ?? "League"} (tier ${league.tier?.tier ?? "?"} of ${league.tier?.max_tier ?? "?"}), week ${league.week_start} → ${league.week_end}.`,
  ];
  if (me) {
    lines.push(
      `You are #${me.rank} of ${league.cohort_size ?? league.standings.length} with ${me.weekly_xp} XP${
        me.zone === "promote" ? " — in the promotion zone" : me.zone === "demote" ? " — in the demotion zone" : ""
      }.`
    );
  }
  for (const s of league.standings.slice(0, 10)) {
    lines.push(`${s.rank}. ${s.full_name ?? "Learner"} — ${s.weekly_xp} XP${s.is_me ? " (you)" : ""}`);
  }
  return lines.join("\n");
}

export function registerNotificationTools(server: LmsServer) {
  // ── lms_my_notifications ────────────────────────────────────────────────────
  server.tool(
    {
      name: "lms_my_notifications",
      description:
        "List the caller's notifications in this school (newest first) with the unread count — announcements, payment and enrollment notices, community replies and mentions.",
      inputSchema: myNotificationsInput,
      outputSchema: myNotificationsOutput,
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
        session = LmsSession.fromContext(ctx);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      try {
        const supabase = session.getClient();
        const userId = session.getUserId();
        const tenantId = session.getTenantId();

        let list = supabase
          .from("user_notifications")
          .select(
            "id, in_app_read, created_at, notification:notifications!inner(title, content, notification_type, priority, tenant_id)"
          )
          .eq("user_id", userId)
          .eq("notification.tenant_id", tenantId)
          .not("dismissed", "is", true);
        if (input.unread_only) list = list.not("in_app_read", "is", true);

        const [listRes, unreadRes] = await Promise.all([
          list.order("created_at", { ascending: false }).limit(input.limit ?? 20),
          supabase
            .from("user_notifications")
            .select("id, notification:notifications!inner(tenant_id)", { count: "exact", head: true })
            .eq("user_id", userId)
            .eq("notification.tenant_id", tenantId)
            .not("dismissed", "is", true)
            .not("in_app_read", "is", true),
        ]);
        if (listRes.error) return errorResult(`Loading notifications: ${listRes.error.message}`);
        if (unreadRes.error) return errorResult(`Counting unread: ${unreadRes.error.message}`);

        const notifications = (listRes.data ?? []).map((row) => {
          const n = row.notification as unknown as {
            title: string | null;
            content: string | null;
            notification_type: string;
            priority: string | null;
          };
          return {
            id: row.id as number,
            read: row.in_app_read === true,
            created_at: row.created_at as string,
            title: n?.title ?? "",
            content: n?.content ?? "",
            type: n?.notification_type ?? "general",
            priority: n?.priority ?? "normal",
          };
        });
        const unreadCount = unreadRes.count ?? notifications.filter((n) => !n.read).length;

        const lines = [
          notifications.length === 0
            ? input.unread_only
              ? "No unread notifications."
              : "No notifications."
            : `${unreadCount} unread. Showing ${notifications.length}:`,
          ...notifications.map(
            (n) => `- [${n.read ? "read" : "unread"}] #${n.id} ${n.title}${n.content ? ` — ${n.content}` : ""}`
          ),
        ];
        return structured({ unread_count: unreadCount, notifications }, lines.join("\n"));
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ── lms_mark_notifications_read ─────────────────────────────────────────────
  server.tool(
    {
      name: "lms_mark_notifications_read",
      description:
        "Mark the caller's notifications in this school as read — specific ones by id (from lms_my_notifications) or all of them with all: true.",
      inputSchema: markNotificationsReadInput,
      outputSchema: markNotificationsReadOutput,
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
        session = LmsSession.fromContext(ctx);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      const hasIds = (input.notification_ids?.length ?? 0) > 0;
      if (hasIds === (input.all === true)) {
        return errorResult("Pass either notification_ids or all: true.");
      }

      try {
        const supabase = session.getClient();
        const userId = session.getUserId();
        const tenantId = session.getTenantId();

        // Resolve to the caller's unread rows in THIS school (#870), then mark
        // exactly those — the same read-then-mark loop the web action runs.
        const unreadIds = async (ids?: number[]): Promise<number[]> => {
          let q = supabase
            .from("user_notifications")
            .select("id, notification:notifications!inner(tenant_id)")
            .eq("user_id", userId)
            .eq("notification.tenant_id", tenantId)
            .not("in_app_read", "is", true)
            .not("dismissed", "is", true);
          if (ids) q = q.in("id", ids);
          const { data, error } = await q.order("id").limit(MARK_ALL_BATCH);
          if (error) throw new Error(`Loading notifications: ${error.message}`);
          return (data ?? []).map((r) => r.id as number);
        };

        const mark = async (ids: number[]): Promise<number> => {
          const { data, error } = await supabase
            .from("user_notifications")
            .update({ in_app_read: true, in_app_read_at: new Date().toISOString() })
            .eq("user_id", userId)
            .in("id", ids)
            .select("id");
          if (error) throw new Error(`Marking read: ${error.message}`);
          return data?.length ?? 0;
        };

        let marked = 0;
        if (hasIds) {
          const ids = await unreadIds([...new Set(input.notification_ids)]);
          if (ids.length > 0) marked = await mark(ids);
        } else {
          let previousFirst: number | null = null;
          for (let batch = 0; batch < MARK_ALL_MAX_BATCHES; batch++) {
            const ids = await unreadIds();
            // Empty: done. Same first row again: the update did not take.
            if (ids.length === 0 || ids[0] === previousFirst) break;
            previousFirst = ids[0];
            marked += await mark(ids);
          }
        }

        return structured(
          { marked },
          marked === 0 ? "Nothing to mark — already read." : `Marked ${marked} notification(s) as read.`
        );
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ── lms_my_league ───────────────────────────────────────────────────────────
  server.tool(
    {
      name: "lms_my_league",
      description:
        "Show the caller's weekly league in this school: tier, week, their rank and XP, the standings, and who is in the promotion/demotion zone if the week ended now.",
      inputSchema: z.object({}),
      outputSchema: myLeagueOutput,
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
        session = LmsSession.fromContext(ctx);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      try {
        const { data, error } = await getLeagueStandings(session.getClient());
        if (error) return errorResult(`Loading league: ${error.message}`);
        const league = shapeLeague(data);
        return structured(league, describeLeague(league));
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );
}
