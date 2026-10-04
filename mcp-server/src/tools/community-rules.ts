/**
 * Pure rules behind the community tools (#896).
 *
 * Every write the community tools make goes through the caller's RLS client,
 * and since #846 the database is the authority on who may write what
 * (`20260924160000_community_rules_in_db.sql`, `…_community_questions_875.sql`,
 * `…_community_prompt_grades_873.sql`). These helpers only give the friendly
 * error first, in the same words as the web actions (`app/actions/community.ts`,
 * `app/actions/teacher/community-grades.ts`, `app/actions/admin/community.ts`)
 * — and they are what the unit tests pin.
 *
 * Mirrors of `lib/community/{questions,prompt-grades}.ts` live here because the
 * MCP server is a separate package that cannot import the app's `@/lib`.
 */

export const MAX_POST_LENGTH = 5000;
export const MAX_COMMENT_LENGTH = 2000;
export const MAX_REPORT_REASON_LENGTH = 1000;
export const GRADE_MIN = 0;
export const GRADE_MAX = 100;
export const GRADE_FEEDBACK_MAX = 5000;

/** Same shape the web actions accept (`UUID` in community-grades.ts). zod 4's
 *  `.uuid()` is RFC-strict and rejects the seeded `00000000-…-0001` ids. */
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Post types a member may create here. Polls need options (web only for now);
 *  milestones are system posts that only `community_create_milestone()` writes. */
export const CREATABLE_POST_TYPES = ["standard", "question", "discussion_prompt"] as const;
export type CreatablePostType = (typeof CREATABLE_POST_TYPES)[number];

export const FEED_POST_TYPES = ["standard", "question", "discussion_prompt", "poll", "milestone"] as const;

export const REPORT_STATUSES = ["pending", "reviewed", "dismissed"] as const;

export const GRADING_FILTERS = ["all", "ungraded", "graded", "unanswered"] as const;
export type GradingFilter = (typeof GRADING_FILTERS)[number];

export function isStaffRole(role: string | null | undefined): boolean {
  return role === "teacher" || role === "admin";
}

export interface NewPostInput {
  role: string;
  post_type: CreatablePostType;
  content: string;
  course_id?: number | null;
  lesson_id?: number | null;
  is_graded?: boolean;
  due_at?: string | null;
}

/**
 * The checks `createPost` makes before it writes, minus the ones only the
 * database can answer (mute, plan, school-feed switch, course reach — those
 * come back as RLS refusals). Returns an error message, or null when the post
 * may be attempted.
 */
export function validateNewPost(input: NewPostInput): string | null {
  const content = input.content ?? "";
  if (content.trim().length === 0) return "Content is required";
  if (content.length > MAX_POST_LENGTH) return `Content must be under ${MAX_POST_LENGTH} characters`;

  const graded = input.is_graded === true;
  if (!isStaffRole(input.role) && (input.post_type === "discussion_prompt" || graded)) {
    return "Only teachers and admins can create this type of post";
  }
  if (graded && input.post_type !== "discussion_prompt") {
    return "Only discussion prompts can be graded";
  }
  if (graded && (input.course_id === null || input.course_id === undefined)) {
    // community_guard_prompt_grade refuses a prompt with no course, so a graded
    // school-feed prompt could never be graded.
    return "A graded discussion prompt needs a course";
  }
  if (input.due_at) {
    if (!(graded && input.post_type === "discussion_prompt")) {
      return "Only graded discussion prompts can have a due date";
    }
    if (Number.isNaN(Date.parse(input.due_at))) return "Invalid due date";
  }
  if ((input.lesson_id ?? null) !== null && (input.course_id ?? null) === null) {
    return "A lesson needs a course";
  }
  return null;
}

/** `createComment`'s up-front checks. */
export function validateComment(content: string): string | null {
  if (!content || content.trim().length === 0) return "Content is required";
  if (content.length > MAX_COMMENT_LENGTH) return `Comment must be under ${MAX_COMMENT_LENGTH} characters`;
  return null;
}

/** `createFlag`'s up-front checks (the RLS policy repeats them). */
export function validateReportReason(reason: string): string | null {
  if (!reason || !reason.trim() || reason.length > MAX_REPORT_REASON_LENGTH) {
    return `Reason is required and must be under ${MAX_REPORT_REASON_LENGTH} characters`;
  }
  return null;
}

/** `canAcceptAnswers` (lib/community/questions.ts): the asker or staff. */
export function canAcceptAnswers(args: {
  viewerId: string;
  viewerRole: string | null;
  questionAuthorId: string;
}): boolean {
  return args.viewerId === args.questionAuthorId || isStaffRole(args.viewerRole);
}

/** `parseGradeScore` (lib/community/prompt-grades.ts). */
export function parseGradeScore(raw: unknown): number | null {
  if (typeof raw === "number") {
    return Number.isInteger(raw) && raw >= GRADE_MIN && raw <= GRADE_MAX ? raw : null;
  }
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!/^\d{1,3}$/.test(trimmed)) return null;
  return parseGradeScore(Number(trimmed));
}

/** `normalizeGradeFeedback` (lib/community/prompt-grades.ts). */
export function normalizeGradeFeedback(raw: unknown): string | null | "invalid" {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "string") return "invalid";
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed.length > GRADE_FEEDBACK_MAX ? "invalid" : trimmed;
}

type PgError = { code?: string; message?: string } | null | undefined;

/** `gradeErrorKey` / `acceptAnswerErrorKey`: both triggers raise 42501 (who)
 *  and 23514 (what). */
export function guardErrorKey(error: PgError): "notAllowed" | "invalid" | null {
  if (!error) return null;
  if (error.code === "42501") return "notAllowed";
  if (error.code === "23514") return "invalid";
  return null;
}

/**
 * A member-facing message for an RLS / constraint refusal on a community write.
 * The policies cannot say WHICH rule failed, so the message lists the rules
 * that apply to this write instead of a bare "row-level security" error.
 */
export function communityWriteError(what: "post" | "comment" | "report" | "vote", error: PgError): string {
  const code = error?.code;
  if (code === "42501") {
    switch (what) {
      case "post":
        return "The school refused this post. You may be muted, the school may not let students post in the school feed, the plan may not include the community, or you may not have access to that course.";
      case "comment":
        return "The school refused this comment. You may be muted, the post may be locked or removed, the plan may not include the community, or you may not have access to its course.";
      case "report":
        return "That post or comment was not found in this school.";
      default:
        return "The school refused this action.";
    }
  }
  if (code === "23505" && what === "report") return "You already have a pending report on this.";
  return `Saving the ${what} failed: ${error?.message ?? "unknown error"}`;
}

export type DueState =
  | { kind: "none" }
  | { kind: "overdue" }
  | { kind: "today" }
  | { kind: "days"; days: number };

const DAY_MS = 24 * 60 * 60 * 1000;

/** `dueState` (lib/community/prompt-grades.ts). */
export function dueState(dueAt: string | null | undefined, now: number = Date.now()): DueState {
  if (!dueAt) return { kind: "none" };
  const due = Date.parse(dueAt);
  if (Number.isNaN(due)) return { kind: "none" };
  const left = due - now;
  if (left < 0) return { kind: "overdue" };
  if (left < DAY_MS) return { kind: "today" };
  return { kind: "days", days: Math.ceil(left / DAY_MS) };
}

export function describeDue(state: DueState): string | null {
  switch (state.kind) {
    case "none":
      return null;
    case "overdue":
      return "past due";
    case "today":
      return "due today";
    case "days":
      return `due in ${state.days} day${state.days === 1 ? "" : "s"}`;
  }
}

// ── grading roster (lib/community/prompt-grades.ts) ─────────────────────────

export type GradingStatus = "ungraded" | "graded" | "unanswered";

export function gradingStatus(row: { answers: unknown[]; grade: unknown | null }): GradingStatus {
  if (row.grade) return "graded";
  return row.answers.length > 0 ? "ungraded" : "unanswered";
}

const STATUS_ORDER: Record<GradingStatus, number> = { ungraded: 0, graded: 1, unanswered: 2 };

export function sortRoster<T extends { answers: unknown[]; grade: unknown | null; name: string | null; student_id: string }>(
  rows: T[]
): T[] {
  return [...rows].sort((a, b) => {
    const s = STATUS_ORDER[gradingStatus(a)] - STATUS_ORDER[gradingStatus(b)];
    if (s !== 0) return s;
    const an = (a.name ?? "").toLocaleLowerCase();
    const bn = (b.name ?? "").toLocaleLowerCase();
    if (an !== bn) return an < bn ? -1 : 1;
    return a.student_id < b.student_id ? -1 : a.student_id > b.student_id ? 1 : 0;
  });
}

export function filterRoster<T extends { answers: unknown[]; grade: unknown | null }>(
  rows: T[],
  filter: GradingFilter
): T[] {
  if (filter === "all") return rows;
  return rows.filter((row) => gradingStatus(row) === filter);
}

export function rosterCounts(rows: { answers: unknown[]; grade: unknown | null }[]): Record<GradingFilter, number> {
  const counts: Record<GradingFilter, number> = { all: rows.length, ungraded: 0, graded: 0, unanswered: 0 };
  for (const row of rows) counts[gradingStatus(row)]++;
  return counts;
}

// ── display ──────────────────────────────────────────────────────────────────

/**
 * The sentence a milestone post stands for. Milestone posts have
 * `content = ''`; every client renders them from `milestone_type` +
 * `milestone_data` (web: `readMilestone()` in lib/community/milestones.ts).
 */
export function milestoneSentence(type: string | null, data: unknown): string {
  const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const title = typeof d.course_title === "string" && d.course_title.trim() ? `"${d.course_title}"` : "a course";
  switch (type) {
    case "course_completion":
      return d.certificate === true ? `Completed ${title} and earned the certificate` : `Completed ${title}`;
    case "certificate":
      return `Earned the certificate for ${title}`;
    case "level_up":
      return typeof d.level === "number" ? `Reached level ${d.level}` : "Reached a new level";
    case "streak":
      return typeof d.days === "number" ? `Kept a ${d.days}-day streak` : "Kept a learning streak";
    default:
      return "Reached a milestone";
  }
}

/** One line of post text: the content (or the milestone sentence), collapsed. */
export function excerpt(text: string | null | undefined, max = 280): string {
  const flat = (text ?? "").replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** Mention tokens `[@Name](mention:<uuid>)` read as "@Name" outside the web. */
export function plainMentions(text: string): string {
  return text.replace(/\[@([^\]]+)\]\(mention:[0-9a-f-]{36}\)/gi, "@$1");
}

export interface ThreadComment {
  id: string;
  parent_comment_id: string | null;
  author_name: string | null;
  content: string;
  created_at: string;
  helpful_count: number;
  is_accepted: boolean;
}

/**
 * Order a thread for reading: top-level comments first (for a question, the
 * accepted answer, then by `helpful`, then oldest — `rankAnswers()`), each
 * followed by its replies in chronological order, depth-first.
 */
export function orderThread<T extends ThreadComment>(comments: T[], isQuestion: boolean): Array<T & { depth: number }> {
  const byParent = new Map<string | null, T[]>();
  const ids = new Set(comments.map((c) => c.id));
  for (const c of comments) {
    // A reply whose parent is not visible to the caller is shown at the root.
    const key = c.parent_comment_id && ids.has(c.parent_comment_id) ? c.parent_comment_id : null;
    const list = byParent.get(key) ?? [];
    list.push(c);
    byParent.set(key, list);
  }
  const chrono = (a: T, b: T) => Date.parse(a.created_at) - Date.parse(b.created_at);
  const roots = [...(byParent.get(null) ?? [])].sort((a, b) => {
    if (isQuestion) {
      if (a.is_accepted !== b.is_accepted) return a.is_accepted ? -1 : 1;
      if (b.helpful_count !== a.helpful_count) return b.helpful_count - a.helpful_count;
    }
    return chrono(a, b);
  });

  const out: Array<T & { depth: number }> = [];
  const visit = (node: T, depth: number) => {
    out.push({ ...node, depth });
    for (const child of [...(byParent.get(node.id) ?? [])].sort(chrono)) visit(child, depth + 1);
  };
  for (const root of roots) visit(root, 0);
  return out;
}
