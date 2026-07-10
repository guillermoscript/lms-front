import {
  McpUseProvider,
  useWidget,
  useWidgetTheme,
  type WidgetMetadata,
} from "mcp-use/react";
import { z } from "zod";

// ── Schema ──────────────────────────────────────────────────────────────────

const achievementSchema = z.object({
  slug: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  tier: z.string().nullable(),
  icon: z.string().nullable(),
  xp_reward: z.number().nullable(),
  earned_at: z.string(),
});

const propsSchema = z.object({
  has_profile: z.boolean(),
  total_xp: z.number(),
  level: z.number(),
  level_title: z.string().nullable(),
  level_icon: z.string().nullable(),
  next_level: z.object({ level: z.number(), min_xp: z.number() }).nullable(),
  xp_into_level: z.number(),
  xp_needed: z.number().nullable(),
  coins: z.number(),
  current_streak: z.number(),
  longest_streak: z.number(),
  rank: z.number().nullable(),
  participants: z.number(),
  achievements: z.array(achievementSchema),
});

export const widgetMetadata: WidgetMetadata = {
  description:
    "Student gamification profile: XP, level progress, coins, streaks, leaderboard rank, and earned achievements",
  props: propsSchema,
  exposeAsTool: false,
  metadata: {
    invoking: "Loading your progress...",
    invoked: "Profile ready",
  },
};

type Props = z.infer<typeof propsSchema>;

// ── Helpers ──────────────────────────────────────────────────────────────────

function tierColor(
  tier: string | null,
  dark: boolean
): { bg: string; text: string } {
  switch ((tier ?? "").toLowerCase()) {
    case "gold":
      return { bg: dark ? "#422006" : "#fef3c7", text: dark ? "#fcd34d" : "#92400e" };
    case "silver":
      return { bg: dark ? "#334155" : "#f1f5f9", text: dark ? "#cbd5e1" : "#475569" };
    case "bronze":
      return { bg: dark ? "#431407" : "#ffedd5", text: dark ? "#fdba74" : "#9a3412" };
    case "platinum":
    case "diamond":
      return { bg: dark ? "#164e63" : "#cffafe", text: dark ? "#67e8f9" : "#155e75" };
    default:
      return { bg: dark ? "#2e1065" : "#f5f3ff", text: dark ? "#a78bfa" : "#7c3aed" };
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ── Component ────────────────────────────────────────────────────────────────

export default function GamificationProfile() {
  const { props, isPending } = useWidget<Props>();
  const theme = useWidgetTheme();
  const dark = theme === "dark";

  const colors = {
    bg: dark ? "#0f0f0f" : "#fafafa",
    surface: dark ? "#1a1a1a" : "#ffffff",
    border: dark ? "#2a2a2a" : "#e5e7eb",
    text: dark ? "#f4f4f5" : "#111827",
    textSecondary: dark ? "#a1a1aa" : "#6b7280",
    textMuted: dark ? "#71717a" : "#9ca3af",
    accent: dark ? "#a78bfa" : "#7c3aed",
    accentBg: dark ? "#2e1065" : "#f5f3ff",
    track: dark ? "#27272a" : "#f4f4f5",
  };

  if (isPending) {
    return (
      <McpUseProvider autoSize>
        <div
          style={{
            padding: 40,
            textAlign: "center",
            color: colors.textMuted,
            backgroundColor: colors.bg,
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              border: `3px solid ${colors.border}`,
              borderTop: `3px solid ${colors.accent}`,
              borderRadius: "50%",
              margin: "0 auto 12px",
              animation: "spin 0.8s linear infinite",
            }}
          />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <p style={{ margin: 0, fontSize: 14 }}>Loading your progress…</p>
        </div>
      </McpUseProvider>
    );
  }

  if (!props.has_profile) {
    return (
      <McpUseProvider autoSize>
        <div
          style={{
            fontFamily: "system-ui, sans-serif",
            backgroundColor: colors.bg,
            padding: 24,
            maxWidth: 680,
            margin: "0 auto",
          }}
        >
          <div
            style={{
              backgroundColor: colors.surface,
              border: `1px solid ${colors.border}`,
              borderRadius: 12,
              padding: 40,
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 32, marginBottom: 8 }}>⚡</div>
            <p style={{ margin: 0, color: colors.text, fontWeight: 600, fontSize: 15 }}>
              No XP yet
            </p>
            <p style={{ margin: "6px 0 0", color: colors.textMuted, fontSize: 13 }}>
              Complete a lesson to start earning XP and unlocking achievements.
            </p>
          </div>
        </div>
      </McpUseProvider>
    );
  }

  const levelSpan =
    props.next_level && props.xp_needed !== null
      ? props.xp_into_level + props.xp_needed
      : null;
  const levelPct =
    levelSpan && levelSpan > 0
      ? Math.min(Math.round((props.xp_into_level / levelSpan) * 100), 100)
      : 100;

  const stats: Array<{ label: string; value: string; icon: string }> = [
    { icon: "🪙", label: "Coins", value: String(props.coins) },
    { icon: "🔥", label: "Streak", value: `${props.current_streak}d` },
    { icon: "🏆", label: "Best streak", value: `${props.longest_streak}d` },
    {
      icon: "📊",
      label: "Rank",
      value: props.rank !== null ? `#${props.rank} of ${props.participants}` : "—",
    },
  ];

  return (
    <McpUseProvider autoSize>
      <div
        style={{
          fontFamily: "system-ui, -apple-system, sans-serif",
          backgroundColor: colors.bg,
          padding: 24,
          maxWidth: 680,
          margin: "0 auto",
        }}
      >
        {/* Level hero */}
        <div
          style={{
            backgroundColor: colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: 12,
            padding: 20,
            marginBottom: 14,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              marginBottom: 14,
            }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 14,
                backgroundColor: colors.accentBg,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 26,
                flexShrink: 0,
              }}
            >
              {props.level_icon ?? "⭐"}
            </div>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 750,
                  color: colors.text,
                  letterSpacing: "-0.02em",
                }}
              >
                Level {props.level}
                {props.level_title ? ` · ${props.level_title}` : ""}
              </div>
              <div style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2 }}>
                {props.total_xp.toLocaleString()} XP total
              </div>
            </div>
          </div>

          {/* XP progress to next level */}
          <div
            style={{
              height: 10,
              borderRadius: 999,
              backgroundColor: colors.track,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${levelPct}%`,
                borderRadius: 999,
                backgroundColor: colors.accent,
                transition: "width 0.4s ease",
              }}
            />
          </div>
          <div
            style={{
              marginTop: 6,
              fontSize: 12,
              color: colors.textMuted,
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            {props.next_level && props.xp_needed !== null ? (
              <>
                <span>
                  {props.xp_needed.toLocaleString()} XP to level{" "}
                  {props.next_level.level}
                </span>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>{levelPct}%</span>
              </>
            ) : (
              <span>Max level reached 🎉</span>
            )}
          </div>
        </div>

        {/* Stat tiles */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
            gap: 10,
            marginBottom: 14,
          }}
        >
          {stats.map((s) => (
            <div
              key={s.label}
              style={{
                backgroundColor: colors.surface,
                border: `1px solid ${colors.border}`,
                borderRadius: 12,
                padding: "12px 14px",
              }}
            >
              <div style={{ fontSize: 18 }}>{s.icon}</div>
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 750,
                  color: colors.text,
                  marginTop: 4,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {s.value}
              </div>
              <div style={{ fontSize: 11.5, color: colors.textMuted, marginTop: 1 }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>

        {/* Achievements */}
        <div
          style={{
            backgroundColor: colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "12px 16px",
              borderBottom: `1px solid ${colors.border}`,
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 600, color: colors.text }}>
              Achievements ({props.achievements.length})
            </span>
          </div>

          {props.achievements.length === 0 ? (
            <div
              style={{
                padding: 24,
                textAlign: "center",
                color: colors.textMuted,
                fontSize: 13,
              }}
            >
              No achievements earned yet — keep learning!
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))",
                gap: 10,
                padding: 14,
              }}
            >
              {props.achievements.map((a) => {
                const tier = tierColor(a.tier, dark);
                return (
                  <div
                    key={a.slug + a.earned_at}
                    style={{
                      border: `1px solid ${colors.border}`,
                      borderRadius: 10,
                      padding: 12,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 6,
                      }}
                    >
                      <span style={{ fontSize: 20 }}>{a.icon ?? "🏅"}</span>
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 650,
                          color: colors.text,
                          lineHeight: 1.25,
                        }}
                      >
                        {a.title}
                      </span>
                    </div>
                    {a.description && (
                      <div
                        style={{
                          fontSize: 11.5,
                          color: colors.textMuted,
                          lineHeight: 1.45,
                          marginBottom: 8,
                        }}
                      >
                        {a.description}
                      </div>
                    )}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 6,
                      }}
                    >
                      {a.tier ? (
                        <span
                          style={{
                            padding: "2px 8px",
                            borderRadius: 8,
                            fontSize: 10.5,
                            fontWeight: 700,
                            textTransform: "capitalize",
                            backgroundColor: tier.bg,
                            color: tier.text,
                          }}
                        >
                          {a.tier}
                        </span>
                      ) : (
                        <span />
                      )}
                      <span style={{ fontSize: 11, color: colors.textMuted }}>
                        {formatDate(a.earned_at)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </McpUseProvider>
  );
}
