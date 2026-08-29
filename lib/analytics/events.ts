/**
 * Product-analytics event contract (OpenPanel).
 *
 * THIS FILE IS THE CONTRACT. Every server action, route handler, cron job,
 * client component and — eventually — the Expo app and the MCP server emit
 * names from this list and nothing else. A name that only exists at one call
 * site is a name nobody can chart.
 *
 * Source of truth: `docs/ANALYTICS_OPENPANEL.md` §4 (the five revenue loops)
 * and §9–§10 (the coverage sweep). Grouped here the same way, so the doc and
 * the code can be diffed by eye.
 *
 * CONVENTIONS (do not deviate — mixed conventions make funnels unbuildable)
 *   - `object_verb`, snake_case, PAST TENSE: `checkout_completed`, never
 *     `completeCheckout` and never `checkout_complete`.
 *   - Property keys are snake_case too.
 *   - NEVER re-declare `tenant_id`, `locale`, `role` or `profileId` in an
 *     event's properties. `lib/analytics/server.ts` merges them into every
 *     event from the call context, and a hand-passed copy will silently
 *     disagree with the merged one.
 *   - Money is in MAJOR units and NET of refunds (`netOfRefunds()` in
 *     `lib/payments/payouts-owed.ts`). See §4 Loop C trap 1.
 *
 * DELIBERATE DEDUPLICATIONS (the doc names these twice; one wins)
 *   - `ai_tutor_message_sent` wins over §9.3's `ai_message_sent`.
 *   - `community_post_created` wins over §9.3's bare `post_created`.
 *   - `exam_graded` wins over §9.4's `submission_graded` — same write, and
 *     `exam_graded` already carries `graded_by: 'ai' | 'human'`.
 */

export const ANALYTICS_EVENTS = {
  // ───────────────────────────────────────────────────────────────────────
  // Loop A — Acquisition (visitor → school owner) · platform growth
  // ───────────────────────────────────────────────────────────────────────
  LANDING_VIEWED: 'landing_viewed',
  PRICING_VIEWED: 'pricing_viewed',
  SCHOOL_SIGNUP_STARTED: 'school_signup_started',
  SCHOOL_CREATED: 'school_created',
  ONBOARDING_STEP_COMPLETED: 'onboarding_step_completed',
  ONBOARDING_COMPLETED: 'onboarding_completed',
  JOIN_SCHOOL_REQUESTED: 'join_school_requested',

  // ───────────────────────────────────────────────────────────────────────
  // Loop B — School activation (owner → publishable, sellable school)
  // The highest-leverage loop. `school_activated` is THE activation metric:
  // fire it exactly once per tenant, guarded on a `tenant_settings` flag.
  // ───────────────────────────────────────────────────────────────────────
  COURSE_CREATED: 'course_created',
  COURSE_AI_GENERATION_STARTED: 'course_ai_generation_started',
  COURSE_AI_GENERATION_COMPLETED: 'course_ai_generation_completed',
  LESSON_CREATED: 'lesson_created',
  /** Transition-detected: fire ONLY on draft → published, never on every save. */
  COURSE_PUBLISHED: 'course_published',
  PRODUCT_CREATED: 'product_created',
  PAYMENT_PROVIDER_CONNECTED: 'payment_provider_connected',
  /** Two writers set `is_published` (activate + publish) — one event, guard the double-count. */
  LANDING_PAGE_PUBLISHED: 'landing_page_published',
  LANDING_AI_GENERATE_CLICKED: 'landing_ai_generate_clicked',
  /** Derived: first time a tenant has ≥1 published course AND ≥1 connected provider. */
  SCHOOL_ACTIVATED: 'school_activated',

  // ───────────────────────────────────────────────────────────────────────
  // Loop C — Monetization (student → payment → entitlement) · the money loop
  // ALL settlement events are SERVER-side (§2.3): Solana has no redirect,
  // manual payments settle days later, adblockers eat browser events.
  // ───────────────────────────────────────────────────────────────────────
  PRODUCT_VIEWED: 'product_viewed',
  CHECKOUT_STARTED: 'checkout_started',
  /** Client-only hole in the money loop: `self_enroll_subscription_course` RPC. */
  COURSE_SELF_ENROLLED: 'course_self_enrolled',
  /** Derived, nightly: `checkout_started` with no terminal event in 24h. */
  CHECKOUT_ABANDONED: 'checkout_abandoned',
  PAYMENT_SUCCEEDED: 'payment_succeeded',
  PAYMENT_FAILED: 'payment_failed',
  ENTITLEMENT_GRANTED: 'entitlement_granted',
  REFUND_ISSUED: 'refund_issued',
  MANUAL_PAYMENT_REQUESTED: 'manual_payment_requested',
  /** Attribute to the STUDENT's profileId and backdate via ctx.timestamp — see §4 trap 3. */
  MANUAL_PAYMENT_CONFIRMED: 'manual_payment_confirmed',

  // ───────────────────────────────────────────────────────────────────────
  // Loop D — Learning engagement · retention
  // Highest-volume loop. Throttle: video at 4 milestones, never heartbeats.
  // ───────────────────────────────────────────────────────────────────────
  LESSON_VIEWED: 'lesson_viewed',
  LESSON_COMPLETED: 'lesson_completed',
  LESSON_UNCOMPLETED: 'lesson_uncompleted',
  /** Throttled to 25/50/75/100 only. */
  VIDEO_PROGRESS: 'video_progress',
  CHECKPOINT_ATTEMPTED: 'checkpoint_attempted',
  EXERCISE_SUBMITTED: 'exercise_submitted',
  EXAM_SUBMITTED: 'exam_submitted',
  EXAM_GRADED: 'exam_graded',
  AI_TUTOR_MESSAGE_SENT: 'ai_tutor_message_sent',
  CERTIFICATE_ISSUED: 'certificate_issued',
  COURSE_COMPLETED: 'course_completed',
  COMMUNITY_POST_CREATED: 'community_post_created',

  // ───────────────────────────────────────────────────────────────────────
  // Loop E — Platform revenue (school → upgrade → churn) · our income
  // `plan_limit_hit` → `upgrade_page_viewed` → `plan_changed` is the funnel
  // that tells us whether the free-tier limits are set correctly.
  // ───────────────────────────────────────────────────────────────────────
  PLAN_LIMIT_HIT: 'plan_limit_hit',
  UPGRADE_PAGE_VIEWED: 'upgrade_page_viewed',
  PLAN_CHANGE_PREVIEWED: 'plan_change_previewed',
  PLAN_CHANGED: 'plan_changed',
  /** Crypto rails have no subscription object — a 2nd checkout IS a renewal. Set `is_renewal`. */
  PLATFORM_PAYMENT_SUCCEEDED: 'platform_payment_succeeded',
  SUBSCRIPTION_CANCEL_SCHEDULED: 'subscription_cancel_scheduled',
  SUBSCRIPTION_REACTIVATED: 'subscription_reactivated',
  SUBSCRIPTION_EXPIRED: 'subscription_expired',

  // ───────────────────────────────────────────────────────────────────────
  // §9.1 — Public / marketing surfaces
  // ───────────────────────────────────────────────────────────────────────
  CATALOG_VIEWED: 'catalog_viewed',
  COURSE_DETAIL_VIEWED: 'course_detail_viewed',
  /** The free-sample conversion lever (#426) — preview → purchase is the best test of a course page. */
  PUBLIC_LESSON_PREVIEWED: 'public_lesson_previewed',
  TENANT_LANDING_VIEWED: 'tenant_landing_viewed',
  TENANT_LANDING_CTA_CLICKED: 'tenant_landing_cta_clicked',
  CREATORS_PAGE_VIEWED: 'creators_page_viewed',
  CERTIFICATE_VERIFIED: 'certificate_verified',

  // ───────────────────────────────────────────────────────────────────────
  // §9.2 — Auth · the cheapest leak to find
  // ───────────────────────────────────────────────────────────────────────
  SIGNUP_STARTED: 'signup_started',
  SIGNUP_SUBMITTED: 'signup_submitted',
  SIGNUP_FAILED: 'signup_failed',
  SIGNUP_CONFIRMED: 'signup_confirmed',
  LOGIN_SUCCEEDED: 'login_succeeded',
  LOGIN_FAILED: 'login_failed',
  PASSWORD_RESET_REQUESTED: 'password_reset_requested',
  PASSWORD_RESET_COMPLETED: 'password_reset_completed',
  /** A silent auth failure is a user who never files a bug and never comes back. */
  AUTH_ERROR_SHOWN: 'auth_error_shown',

  // ───────────────────────────────────────────────────────────────────────
  // §9.3 — Student surfaces · gamification is the retention engine
  // ───────────────────────────────────────────────────────────────────────
  CATALOG_SEARCHED: 'catalog_searched',
  /** Content-gap detector: tells a school exactly which course to build next. */
  BROWSE_ZERO_RESULTS: 'browse_zero_results',
  STORE_VIEWED: 'store_viewed',
  STORE_ITEM_PURCHASED: 'store_item_purchased',
  STORE_PURCHASE_BLOCKED: 'store_purchase_blocked',
  XP_AWARDED: 'xp_awarded',
  ACHIEVEMENT_UNLOCKED: 'achievement_unlocked',
  STREAK_CONTINUED: 'streak_continued',
  /** Best churn predictor for learners — precedes disengagement by days. */
  STREAK_BROKEN: 'streak_broken',
  LEAGUE_PROMOTED: 'league_promoted',
  LEAGUE_DEMOTED: 'league_demoted',
  CERTIFICATE_VIEWED: 'certificate_viewed',
  CERTIFICATE_SHARED: 'certificate_shared',
  /** Surfaces the known "100% but no cert" confusion — auto-issue is template-gated. */
  CERTIFICATE_EXPECTED_BUT_MISSING: 'certificate_expected_but_missing',
  STUDENT_SUBSCRIPTION_CANCEL_CLICKED: 'student_subscription_cancel_clicked',
  STUDENT_SUBSCRIPTION_CANCEL_CONFIRMED: 'student_subscription_cancel_confirmed',
  AI_SESSION_STARTED: 'ai_session_started',
  AI_SESSION_ABANDONED: 'ai_session_abandoned',
  COMMUNITY_FEED_VIEWED: 'community_feed_viewed',
  /**
   * Not in the coverage map, added with the Loop D community sweep: replies are
   * the half of community engagement that indicates a conversation rather than
   * a broadcast, and `community_post_created` alone cannot distinguish them.
   */
  COMMUNITY_COMMENT_CREATED: 'community_comment_created',
  REACTION_ADDED: 'reaction_added',
  POLL_VOTED: 'poll_voted',
  PROGRESS_VIEWED: 'progress_viewed',
  /** The last screen before a learner leaves. */
  ACCESS_SUSPENDED_SHOWN: 'access_suspended_shown',

  // ───────────────────────────────────────────────────────────────────────
  // §9.4 — Teacher / creator · where creators quit
  // ───────────────────────────────────────────────────────────────────────
  /** Loop B says creators don't publish; only the editor events say WHY. */
  LESSON_EDITOR_OPENED: 'lesson_editor_opened',
  LESSON_EDITOR_SAVED: 'lesson_editor_saved',
  LESSON_EDITOR_ABANDONED: 'lesson_editor_abandoned',
  COURSE_PREVIEWED: 'course_previewed',
  EXAM_CREATED: 'exam_created',
  EXERCISE_CREATED: 'exercise_created',
  /** The AI-grading quality metric: a high override rate means teachers don't trust it. */
  AI_GRADE_OVERRIDDEN: 'ai_grade_overridden',
  CERTIFICATE_TEMPLATE_CONFIGURED: 'certificate_template_configured',
  TEACHER_ANALYTICS_VIEWED: 'teacher_analytics_viewed',
  TEACHER_REVENUE_VIEWED: 'teacher_revenue_viewed',
  TEMPLATE_USED: 'template_used',
  MCP_TOKEN_CREATED: 'mcp_token_created',

  // ───────────────────────────────────────────────────────────────────────
  // §9.5 — Admin (school). Most of this surface is already Loops B and E.
  // ───────────────────────────────────────────────────────────────────────
  /** A strong activation proxy: an owner who brands their school is invested. */
  THEME_CUSTOMIZED: 'theme_customized',
  STUDENT_INVITED: 'student_invited',
  INVITE_LINK_COPIED: 'invite_link_copied',
  MODERATION_ACTION_TAKEN: 'moderation_action_taken',
  NOTIFICATION_TEMPLATE_EDITED: 'notification_template_edited',

  // ───────────────────────────────────────────────────────────────────────
  // §10.3 — Email / notifications. No open pixels (breaks the cookieless
  // posture); track dispatch and the return trip instead.
  // ───────────────────────────────────────────────────────────────────────
  NOTIFICATION_DISPATCHED: 'notification_dispatched',
  DIGEST_SENT: 'digest_sent',
  /** Closes the loop: does the daily digest (#397) actually bring learners back? */
  RETURNED_FROM_NOTIFICATION: 'returned_from_notification',

  // ───────────────────────────────────────────────────────────────────────
  // §10.2 — MCP server (`mcp-server/`, separate deployment, own env vars).
  // The names live here so both repos agree; the emitters do NOT.
  // ───────────────────────────────────────────────────────────────────────
  MCP_TOOL_CALLED: 'mcp_tool_called',
  MCP_TOOL_FAILED: 'mcp_tool_failed',
  MCP_SESSION_STARTED: 'mcp_session_started',
} as const

/** Every event name the platform is allowed to emit. */
export type AnalyticsEventName =
  (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS]

/** Free-form event properties. snake_case keys; no PII, ever. */
export type AnalyticsProperties = Record<string, unknown>

/**
 * Compile-time shapes for the events where a wrong or missing property costs
 * money or silently corrupts a chart. Deliberately NOT exhaustive: typing all
 * ~100 events would turn every future call site into a type-editing exercise
 * for no safety gain on events nobody sums.
 *
 * Each shape is intersected with an index signature at the call site, so extra
 * properties are always allowed — these are the *required minimum*, not a
 * whitelist.
 */
export interface KnownEventProperties {
  // Loop C — the money loop.
  checkout_started: {
    provider: string
    amount: number
    currency: string
    product_id?: string | number
    plan_id?: string | number
  }
  payment_succeeded: {
    provider: string
    /** MAJOR units, NET of refunds. Use `netOfRefunds()`. */
    amount_major: number
    currency: string
    is_subscription: boolean
    platform_fee?: number
    school_percentage_snapshot?: number | null
  }
  payment_failed: {
    provider: string
    failure_reason: string
  }
  refund_issued: {
    /** Partial refunds keep `transactions.status = 'successful'` (#547). */
    is_partial: boolean
    refunded_amount: number
    net_amount: number
    currency: string
  }
  entitlement_granted: {
    source_type: string
    course_count: number
  }

  // Loop E — platform revenue.
  platform_payment_succeeded: {
    provider: string
    amount: number
    interval: string
    /** Crypto rails have no subscription object: a 2nd checkout is a RENEWAL. */
    is_renewal: boolean
  }
  plan_changed: {
    from_plan: string
    to_plan: string
    is_upgrade: boolean
    provider?: string
  }
  plan_limit_hit: {
    limit_type: string
    plan: string
    current: number
    max: number | null
  }
}

/**
 * Properties accepted for a given event: the known required shape (if any)
 * plus anything else the call site wants to attach.
 */
export type PropertiesFor<E extends AnalyticsEventName> =
  E extends keyof KnownEventProperties
    ? KnownEventProperties[E] & AnalyticsProperties
    : AnalyticsProperties
