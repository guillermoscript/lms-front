import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LmsServer } from "../server-types.js";
import { LmsSession } from "../session.js";
import { errorResult } from "../format.js";
import {
  CREATABLE_POST_TYPES,
  FEED_POST_TYPES,
  GRADE_FEEDBACK_MAX,
  GRADING_FILTERS,
  MAX_COMMENT_LENGTH,
  MAX_POST_LENGTH,
  MAX_REPORT_REASON_LENGTH,
  REPORT_STATUSES,
  UUID_RE,
  canAcceptAnswers,
  communityWriteError,
  describeDue,
  dueState,
  excerpt,
  filterRoster,
  guardErrorKey,
  isStaffRole,
  milestoneSentence,
  normalizeGradeFeedback,
  orderThread,
  parseGradeScore,
  plainMentions,
  rosterCounts,
  sortRoster,
  gradingStatus,
  validateComment,
  validateNewPost,
  validateReportReason,
} from "./community-rules.js";

/**
 * Community + moderation tools (#896).
 *
 * ── ONE DATA PATH: THE CALLER'S RLS CLIENT ─────────────────────────────────
 * The web actions (`app/actions/community.ts`) write with the service role and
 * re-check every rule in TypeScript. The MCP server never holds the service
 * role, so it takes the path the native app takes: since #846 every community
 * rule is ALSO a policy or a trigger (mute, plan gate, school-feed switch,
 * course reach, locked/hidden posts, reply parents, accepted answers #875,
 * prompt grades #873). The handlers below repeat the cheap checks only to give
 * the web's friendly message first; the database decides.
 *
 * Inserts set their own `id` and do not ask for the row back: a course post's
 * SELECT policy still keys on an active `enrollments` row (a documented
 * limitation in docs/COMMUNITY_SPACES.md), so `INSERT … RETURNING` would fail
 * for a student entitled through a subscription who may write but not read.
 *
 * ── WHAT IS NOT HERE, AND WHY ──────────────────────────────────────────────
 * Pinning, locking and hiding posts/comments and reviewing reports are
 * service-role writes in `app/actions/admin/community.ts` — `authenticated`
 * has no UPDATE grant on those columns (#846), so an RLS client cannot do
 * them. Banning (#892) runs through `ban_tenant_member` / `lift_tenant_ban`,
 * which are EXECUTE-granted to `service_role` only, and the web action also
 * clears the banned user's tenant claim through the Auth admin API. The admin
 * tools here list reports, mutes and bans and point at the web page for those
 * moves rather than re-implement them around the database's grants.
 *
 * Every read filters `tenant_id` explicitly and drops `is_hidden` rows (admins'
 * RLS also returns removed content).
 */

// ── shared plumbing ─────────────────────────────────────────────────────────

const uuid = (what: string) => z.string().regex(UUID_RE, `${what} must be a UUID`);
const positiveInt = z.number().int().positive();

type Envelope<T> = { content: { type: "text"; text: string }[]; structuredContent: T };

function result<T>(structuredContent: T, text: string): Envelope<T> {
  return { content: [{ type: "text", text }], structuredContent };
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

type ErrorResult = ReturnType<typeof errorResult>;

/** Build the session, run the body, turn anything thrown into `errorResult`. */
async function withSession<T>(
  ctx: unknown,
  body: (session: LmsSession) => Promise<T | ErrorResult>
): Promise<T | ErrorResult> {
  let session: LmsSession;
  try {
    session = LmsSession.fromContext(ctx);
  } catch (err) {
    return errorResult(messageOf(err));
  }
  try {
    return await body(session);
  } catch (err) {
    return errorResult(messageOf(err));
  }
}

/**
 * The plan gate (`community_enabled()`, the same function RLS
 * `community_can_write` uses). Closed on error, like `isCommunityEnabled`.
 */
async function communityGate(session: LmsSession): Promise<string | null> {
  const { data, error } = await session
    .getClient()
    .rpc("community_enabled", { _tenant_id: session.getTenantId() });
  if (error) return `Checking whether this school has the community: ${error.message}`;
  return data === true ? null : "This school's plan does not include the community (Starter plan or higher).";
}

const IN_CHUNK = 200;

/** Display names by user id (profiles are global). Missing names stay null. */
async function profileNames(
  supabase: SupabaseClient,
  ids: (string | null | undefined)[]
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  const names = new Map<string, string>();
  for (let i = 0; i < unique.length; i += IN_CHUNK) {
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", unique.slice(i, i + IN_CHUNK));
    for (const p of (data as { id: string; full_name: string | null }[] | null) ?? []) {
      const name = p.full_name?.trim();
      if (name) names.set(p.id, name);
    }
  }
  return names;
}

interface PostRow {
  id: string;
  course_id: number | null;
  lesson_id: number | null;
  author_id: string;
  post_type: string;
  title: string | null;
  content: string;
  is_pinned: boolean;
  is_locked: boolean;
  is_graded: boolean;
  due_at: string | null;
  accepted_comment_id: string | null;
  milestone_type: string | null;
  milestone_data: unknown;
  comment_count: number;
  reaction_count: number;
  created_at: string;
}

const POST_COLUMNS =
  "id, course_id, lesson_id, author_id, post_type, title, content, is_pinned, is_locked, is_graded, due_at, accepted_comment_id, milestone_type, milestone_data, comment_count, reaction_count, created_at";

/** A visible post of this school the caller can read (RLS decides the rest). */
async function loadVisiblePost(session: LmsSession, postId: string): Promise<PostRow> {
  const { data, error } = await session
    .getClient()
    .from("community_posts")
    .select(POST_COLUMNS)
    .eq("id", postId)
    .eq("tenant_id", session.getTenantId())
    .eq("is_hidden", false)
    .maybeSingle();
  if (error) throw new Error(`Loading post: ${error.message}`);
  if (!data) throw new Error("Post not found");
  const post = data as PostRow;
  if (post.course_id !== null && session.getRole() === "student") {
    await session.verifyCourseAccess(post.course_id);
  }
  return post;
}

function postText(post: Pick<PostRow, "post_type" | "content" | "milestone_type" | "milestone_data">): string {
  return post.post_type === "milestone"
    ? milestoneSentence(post.milestone_type, post.milestone_data)
    : plainMentions(post.content);
}

// ── output schemas ──────────────────────────────────────────────────────────

const PostSummarySchema = z.object({
  id: z.string(),
  course_id: z.number().nullable(),
  lesson_id: z.number().nullable(),
  author_id: z.string(),
  author_name: z.string().nullable(),
  post_type: z.string(),
  title: z.string().nullable(),
  excerpt: z.string(),
  is_pinned: z.boolean(),
  is_locked: z.boolean(),
  is_graded: z.boolean(),
  due_at: z.string().nullable(),
  answered: z.boolean().nullable().describe("Questions only: an answer has been accepted"),
  comment_count: z.number(),
  reaction_count: z.number(),
  created_at: z.string(),
});

const ListPostsOutput = z.object({
  scope: z.enum(["school", "course"]),
  course_id: z.number().nullable(),
  posts: z.array(PostSummarySchema),
  has_more: z.boolean(),
});

const GradeSchema = z.object({
  score: z.number(),
  feedback: z.string().nullable(),
  graded_at: z.string(),
});

const GetPostOutput = z.object({
  post: PostSummarySchema.extend({ content: z.string(), accepted_comment_id: z.string().nullable() }),
  comments: z.array(
    z.object({
      id: z.string(),
      parent_comment_id: z.string().nullable(),
      depth: z.number(),
      author_id: z.string(),
      author_name: z.string().nullable(),
      content: z.string(),
      created_at: z.string(),
      helpful_count: z.number(),
      is_accepted: z.boolean(),
    })
  ),
  poll: z
    .object({
      options: z.array(z.object({ id: z.string(), text: z.string(), votes: z.number() })),
      my_option_id: z.string().nullable(),
    })
    .nullable(),
  my_grade: GradeSchema.nullable(),
});

const CreatePostOutput = z.object({
  post_id: z.string(),
  post_type: z.string(),
  course_id: z.number().nullable(),
  lesson_id: z.number().nullable(),
});

const CreateCommentOutput = z.object({
  comment_id: z.string(),
  post_id: z.string(),
  parent_comment_id: z.string().nullable(),
  is_top_level_answer: z.boolean(),
});

const AcceptAnswerOutput = z.object({
  post_id: z.string(),
  accepted_comment_id: z.string().nullable(),
});

const ListPromptsOutput = z.object({
  course_id: z.number(),
  prompts: z.array(
    z.object({
      id: z.string(),
      title: z.string().nullable(),
      excerpt: z.string(),
      lesson_id: z.number().nullable(),
      is_graded: z.boolean(),
      is_locked: z.boolean(),
      due_at: z.string().nullable(),
      due: z.string().nullable().describe("'past due', 'due today', 'due in N days', or null"),
      answered: z.boolean().nullable().describe("Students: whether the caller has a top-level answer"),
      my_grade: GradeSchema.nullable(),
      answer_count: z.number().nullable().describe("Staff: visible top-level answers"),
      graded_count: z.number().nullable().describe("Staff: students graded so far"),
    })
  ),
});

const ReportOutput = z.object({
  reported: z.boolean(),
  target_type: z.enum(["post", "comment"]),
  target_id: z.string(),
});

const BlockOutput = z.object({ user_id: z.string(), blocked: z.boolean() });

const ListBlocksOutput = z.object({
  members: z.array(z.object({ user_id: z.string(), name: z.string().nullable(), blocked_at: z.string() })),
});

const RosterOutput = z.object({
  prompt: z.object({
    id: z.string(),
    course_id: z.number(),
    title: z.string().nullable(),
    excerpt: z.string(),
    is_locked: z.boolean(),
    due_at: z.string().nullable(),
  }),
  counts: z.object({ all: z.number(), ungraded: z.number(), graded: z.number(), unanswered: z.number() }),
  filter: z.enum(GRADING_FILTERS),
  students: z.array(
    z.object({
      student_id: z.string(),
      name: z.string().nullable(),
      status: z.enum(["ungraded", "graded", "unanswered"]),
      answers: z.array(z.object({ comment_id: z.string(), content: z.string(), created_at: z.string() })),
      grade: GradeSchema.nullable(),
    })
  ),
  has_more: z.boolean(),
});

const SaveGradeOutput = z.object({
  student_id: z.string(),
  score: z.number(),
  feedback: z.string().nullable(),
  graded_at: z.string(),
});

const RemoveGradeOutput = z.object({ student_id: z.string(), removed: z.boolean() });

const ListReportsOutput = z.object({
  status: z.string(),
  reports: z.array(
    z.object({
      id: z.string(),
      status: z.string(),
      reason: z.string(),
      created_at: z.string(),
      reporter_id: z.string(),
      reporter_name: z.string().nullable(),
      target_type: z.enum(["post", "comment"]),
      target_id: z.string(),
      post_id: z.string().nullable().describe("The post the content is on (the post itself, or the comment's post)"),
      target_author_id: z.string().nullable(),
      target_author_name: z.string().nullable(),
      target_excerpt: z.string().nullable(),
      target_removed: z.boolean().nullable(),
    })
  ),
});

const MuteOutput = z.object({
  user_id: z.string(),
  muted: z.boolean(),
  muted_until: z.string().nullable(),
});

const ListMutesOutput = z.object({
  mutes: z.array(
    z.object({
      user_id: z.string(),
      name: z.string().nullable(),
      reason: z.string().nullable(),
      muted_until: z.string().nullable(),
      active: z.boolean(),
      muted_by: z.string(),
      created_at: z.string(),
    })
  ),
});

const ListBansOutput = z.object({
  members: z.array(
    z.object({
      user_id: z.string(),
      name: z.string().nullable(),
      role: z.string(),
      banned_at: z.string().nullable(),
      banned_by: z.string().nullable(),
      reason: z.string().nullable(),
    })
  ),
});

// ── input schemas (exported for the unit tests) ─────────────────────────────

export const ListPostsInput = z.object({
  course_id: positiveInt.optional().describe("Course feed to read; omit for the school feed"),
  lesson_id: positiveInt.optional().describe("Only posts tied to this lesson (course feeds)"),
  post_type: z.enum(FEED_POST_TYPES).optional().describe("Only this kind of post"),
  questions: z
    .enum(["unanswered", "answered"])
    .optional()
    .describe("Only questions without / with an accepted answer"),
  limit: z.number().int().min(1).max(50).default(20).describe("Posts per page (max 50)"),
  offset: z.number().int().min(0).default(0).describe("Posts to skip"),
});

export const GetPostInput = z.object({ post_id: uuid("post_id").describe("The community post ID") });

export const CreatePostInput = z.object({
  content: z.string().min(1).max(MAX_POST_LENGTH).describe("Post body (plain text, max 5000 characters)"),
  title: z.string().max(300).optional().describe("Optional title"),
  post_type: z
    .enum(CREATABLE_POST_TYPES)
    .default("standard")
    .describe("'standard', 'question' (asks for an accepted answer), or 'discussion_prompt' (teachers/admins)"),
  course_id: positiveInt.optional().describe("Course feed to post in; omit for the school feed"),
  lesson_id: positiveInt.optional().describe("Lesson of that course the post is about (shows on the lesson page)"),
  is_graded: z.boolean().default(false).describe("Discussion prompts only (teachers/admins): students get a 0-100 grade"),
  due_at: z.string().optional().describe("ISO date-time; graded discussion prompts only. Informational"),
});

export const CreateCommentInput = z.object({
  post_id: uuid("post_id").describe("The post to comment on"),
  content: z.string().min(1).max(MAX_COMMENT_LENGTH).describe("Comment text (max 2000 characters)"),
  parent_comment_id: uuid("parent_comment_id")
    .optional()
    .describe("Reply to this comment. Omit for a top-level comment — which is what answers a question or a discussion prompt"),
});

export const AcceptAnswerInput = z.object({
  post_id: uuid("post_id").describe("The question post"),
  comment_id: uuid("comment_id")
    .nullable()
    .describe("Top-level comment to accept as the answer, or null to clear the accepted answer"),
});

export const ListPromptsInput = z.object({
  course_id: positiveInt.describe("Course whose discussion prompts to list"),
  lesson_id: positiveInt.optional().describe("Only prompts tied to this lesson"),
  limit: z.number().int().min(1).max(25).default(10).describe("Prompts to return (max 25)"),
});

export const ReportInput = z.object({
  target_type: z.enum(["post", "comment"]).describe("What is being reported"),
  target_id: uuid("target_id").describe("The post or comment ID"),
  reason: z.string().min(1).max(MAX_REPORT_REASON_LENGTH).describe("Why it is being reported (max 1000 characters)"),
});

export const BlockInput = z.object({ user_id: uuid("user_id").describe("The member to block / unblock") });

export const RosterInput = z.object({
  course_id: positiveInt.describe("The prompt's course"),
  post_id: uuid("post_id").describe("The graded discussion prompt"),
  filter: z.enum(GRADING_FILTERS).default("all").describe("'ungraded' (answered, waiting), 'graded', 'unanswered', or 'all'"),
  limit: z.number().int().min(1).max(200).default(50).describe("Students per page"),
  offset: z.number().int().min(0).default(0).describe("Students to skip"),
});

export const GradeInput = z.object({
  course_id: positiveInt.describe("The prompt's course"),
  post_id: uuid("post_id").describe("The graded discussion prompt"),
  student_id: uuid("student_id").describe("The student being graded"),
  score: z.number().int().min(0).max(100).describe("Whole number 0-100"),
  feedback: z.string().max(GRADE_FEEDBACK_MAX).nullable().optional().describe("Feedback for the student (max 5000)"),
});

export const RemoveGradeInput = z.object({
  course_id: positiveInt.describe("The prompt's course"),
  post_id: uuid("post_id").describe("The graded discussion prompt"),
  student_id: uuid("student_id").describe("The student whose grade to withdraw"),
});

export const ListReportsInput = z.object({
  status: z.enum([...REPORT_STATUSES, "all"]).default("pending").describe("Report status to list"),
  limit: z.number().int().min(1).max(100).default(25),
  offset: z.number().int().min(0).default(0),
});

export const MuteInput = z.object({
  user_id: uuid("user_id").describe("The member to mute"),
  reason: z.string().max(1000).optional().describe("Optional note"),
  muted_until: z
    .string()
    .optional()
    .describe("ISO date-time the mute ends; omit for an indefinite mute"),
});

const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } as const;
const IDEMPOTENT_WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

function toSummary(post: PostRow, names: Map<string, string>): z.infer<typeof PostSummarySchema> {
  return {
    id: post.id,
    course_id: post.course_id,
    lesson_id: post.lesson_id,
    author_id: post.author_id,
    author_name: names.get(post.author_id) ?? null,
    post_type: post.post_type,
    title: post.title,
    excerpt: excerpt(postText(post)),
    is_pinned: post.is_pinned,
    is_locked: post.is_locked,
    is_graded: post.is_graded,
    due_at: post.due_at,
    answered: post.post_type === "question" ? post.accepted_comment_id !== null : null,
    comment_count: post.comment_count,
    reaction_count: post.reaction_count,
    created_at: post.created_at,
  };
}

function summaryLine(p: z.infer<typeof PostSummarySchema>): string {
  const tags = [
    p.is_pinned ? "pinned" : null,
    p.post_type !== "standard" ? p.post_type.replace("_", " ") : null,
    p.answered === true ? "answered" : p.answered === false ? "unanswered" : null,
    p.is_graded ? "graded" : null,
    p.is_locked ? "locked" : null,
  ].filter(Boolean);
  const head = p.title ? `**${p.title}** — ` : "";
  return `- ${head}${p.excerpt || "(no text)"}\n  by ${p.author_name ?? "a member"} · ${p.created_at.slice(0, 10)} · ${p.comment_count} comment(s)${tags.length ? ` · ${tags.join(", ")}` : ""} · id \`${p.id}\``;
}

// ── registration ────────────────────────────────────────────────────────────

export function registerCommunityTools(server: LmsServer) {
  // ── lms_list_community_posts ──────────────────────────────────────────────
  server.tool(
    {
      name: "lms_list_community_posts",
      description:
        "List posts in the school's community feed, or a course's feed (course_id). Pinned first, then newest. Filter by post type, lesson, or unanswered/answered questions. Read one post and its comments with lms_get_community_post. Course feeds show students the posts of courses they are actively enrolled in.",
      inputSchema: ListPostsInput,
      outputSchema: ListPostsOutput,
      annotations: READ,
    },
    async (input, ctx) =>
      withSession(ctx, async (session) => {
        const gate = await communityGate(session);
        if (gate) return errorResult(gate);
        if (input.lesson_id !== undefined && input.course_id === undefined) {
          return errorResult("lesson_id needs course_id");
        }
        if (input.course_id !== undefined) await session.verifyCourseAccess(input.course_id);

        const supabase = session.getClient();
        let query = supabase
          .from("community_posts")
          .select(POST_COLUMNS)
          .eq("tenant_id", session.getTenantId())
          .eq("is_hidden", false);
        query = input.course_id === undefined ? query.is("course_id", null) : query.eq("course_id", input.course_id);
        if (input.lesson_id !== undefined) query = query.eq("lesson_id", input.lesson_id);
        if (input.questions) {
          query = query.eq("post_type", "question");
          query =
            input.questions === "unanswered"
              ? query.is("accepted_comment_id", null)
              : query.not("accepted_comment_id", "is", null);
        } else if (input.post_type) {
          query = query.eq("post_type", input.post_type);
        }

        const { data, error } = await query
          .order("is_pinned", { ascending: false })
          .order("created_at", { ascending: false })
          .range(input.offset, input.offset + input.limit); // one extra row → has_more
        if (error) return errorResult(`Loading posts: ${error.message}`);

        const rows = (data ?? []) as PostRow[];
        const hasMore = rows.length > input.limit;
        const page = rows.slice(0, input.limit);
        const names = await profileNames(supabase, page.map((p) => p.author_id));
        const posts = page.map((p) => toSummary(p, names));

        const scope = input.course_id === undefined ? "school" : "course";
        const where = scope === "school" ? "School feed" : `Course ${input.course_id} feed`;
        const text =
          posts.length === 0
            ? `${where}: no posts${input.offset ? " on this page" : " yet"}.`
            : `${where} — ${posts.length} post(s)${hasMore ? ` (more: offset=${input.offset + input.limit})` : ""}:\n${posts.map(summaryLine).join("\n")}`;
        return result(
          { scope, course_id: input.course_id ?? null, posts, has_more: hasMore } as z.infer<typeof ListPostsOutput>,
          text
        );
      })
  );

  // ── lms_get_community_post ────────────────────────────────────────────────
  server.tool(
    {
      name: "lms_get_community_post",
      description:
        "Read one community post with its comment thread (replies nested; for a question the accepted answer comes first, then by 'helpful'). Includes poll options and, on a graded discussion prompt, the student's own grade.",
      inputSchema: GetPostInput,
      outputSchema: GetPostOutput,
      annotations: READ,
    },
    async (input, ctx) =>
      withSession(ctx, async (session) => {
        const gate = await communityGate(session);
        if (gate) return errorResult(gate);
        const supabase = session.getClient();
        const tenantId = session.getTenantId();
        const post = await loadVisiblePost(session, input.post_id);

        const { data: commentRows, error: commentsError } = await supabase
          .from("community_comments")
          .select("id, parent_comment_id, author_id, content, created_at")
          .eq("post_id", post.id)
          .eq("tenant_id", tenantId)
          .eq("is_hidden", false)
          .order("created_at", { ascending: true })
          .limit(500);
        if (commentsError) return errorResult(`Loading comments: ${commentsError.message}`);
        const comments = (commentRows ?? []) as {
          id: string;
          parent_comment_id: string | null;
          author_id: string;
          content: string;
          created_at: string;
        }[];

        const helpful = new Map<string, number>();
        const commentIds = comments.map((c) => c.id);
        for (let i = 0; i < commentIds.length; i += IN_CHUNK) {
          const { data } = await supabase
            .from("community_reactions")
            .select("comment_id")
            .eq("tenant_id", tenantId)
            .eq("reaction_type", "helpful")
            .in("comment_id", commentIds.slice(i, i + IN_CHUNK));
          for (const r of (data as { comment_id: string | null }[] | null) ?? []) {
            if (r.comment_id) helpful.set(r.comment_id, (helpful.get(r.comment_id) ?? 0) + 1);
          }
        }

        const names = await profileNames(supabase, [post.author_id, ...comments.map((c) => c.author_id)]);
        const thread = orderThread(
          comments.map((c) => ({
            id: c.id,
            parent_comment_id: c.parent_comment_id,
            author_id: c.author_id,
            author_name: names.get(c.author_id) ?? null,
            content: plainMentions(c.content),
            created_at: c.created_at,
            helpful_count: helpful.get(c.id) ?? 0,
            is_accepted: c.id === post.accepted_comment_id,
          })),
          post.post_type === "question"
        );

        let poll: z.infer<typeof GetPostOutput>["poll"] = null;
        if (post.post_type === "poll") {
          const [{ data: options }, { data: vote }] = await Promise.all([
            supabase
              .from("community_poll_options")
              .select("id, option_text, vote_count, sort_order")
              .eq("post_id", post.id)
              .order("sort_order", { ascending: true }),
            supabase
              .from("community_poll_votes")
              .select("option_id")
              .eq("post_id", post.id)
              .eq("tenant_id", tenantId)
              .eq("user_id", session.getUserId())
              .maybeSingle(),
          ]);
          poll = {
            options: ((options as { id: string; option_text: string; vote_count: number }[] | null) ?? []).map((o) => ({
              id: o.id,
              text: o.option_text,
              votes: o.vote_count,
            })),
            my_option_id: (vote as { option_id: string } | null)?.option_id ?? null,
          };
        }

        let myGrade: z.infer<typeof GradeSchema> | null = null;
        if (post.post_type === "discussion_prompt" && post.is_graded) {
          const { data: grade } = await supabase
            .from("community_prompt_grades")
            .select("score, feedback, graded_at")
            .eq("tenant_id", tenantId)
            .eq("post_id", post.id)
            .eq("student_id", session.getUserId())
            .maybeSingle();
          myGrade = (grade as z.infer<typeof GradeSchema> | null) ?? null;
        }

        const summary = toSummary(post, names);
        const body = postText(post);
        const lines = [
          `${post.title ? `# ${post.title}\n` : ""}${body || "(no text)"}`,
          `— ${summary.author_name ?? "a member"}, ${post.created_at.slice(0, 10)} · ${post.post_type.replace("_", " ")}${post.is_locked ? " · locked (no new comments)" : ""}${post.due_at ? ` · ${describeDue(dueState(post.due_at))}` : ""}`,
        ];
        if (poll) {
          lines.push(
            "Poll:",
            ...poll.options.map((o) => `- ${o.text}: ${o.votes} vote(s)${o.id === poll?.my_option_id ? " (your vote)" : ""}`)
          );
        }
        if (myGrade) lines.push(`Your grade: ${myGrade.score}/100${myGrade.feedback ? ` — ${myGrade.feedback}` : ""}`);
        lines.push(
          thread.length === 0
            ? "No comments yet."
            : `Comments (${thread.length}):\n${thread
                .map(
                  (c) =>
                    `${"  ".repeat(c.depth)}- ${c.is_accepted ? "[accepted answer] " : ""}${c.author_name ?? "a member"}: ${excerpt(c.content, 600)}${c.helpful_count ? ` (${c.helpful_count} helpful)` : ""} · id \`${c.id}\``
                )
                .join("\n")}`
        );

        return result(
          {
            post: { ...summary, content: body, accepted_comment_id: post.accepted_comment_id },
            comments: thread,
            poll,
            my_grade: myGrade,
          } as z.infer<typeof GetPostOutput>,
          lines.join("\n\n")
        );
      })
  );

  // ── lms_create_community_post ─────────────────────────────────────────────
  server.tool(
    {
      name: "lms_create_community_post",
      description:
        "Post in the school feed or a course feed as the caller. post_type 'question' asks the community and later takes an accepted answer (lms_accept_community_answer). Teachers/admins can post a 'discussion_prompt' (optionally graded with a due date, tied to a lesson); students answer it with lms_create_community_comment. Write only what the user asked to post. XP for participation is awarded by the database.",
      inputSchema: CreatePostInput,
      outputSchema: CreatePostOutput,
      annotations: WRITE,
    },
    async (input, ctx) =>
      withSession(ctx, async (session) => {
        const invalid = validateNewPost({ role: session.getRole(), ...input });
        if (invalid) return errorResult(invalid);
        const gate = await communityGate(session);
        if (gate) return errorResult(gate);

        const tenantId = session.getTenantId();
        const supabase = session.getClient();
        if (input.course_id !== undefined) {
          await session.verifyCourseAccess(input.course_id);
          if (input.lesson_id !== undefined) {
            const { data: lesson } = await supabase
              .from("lessons")
              .select("id")
              .eq("id", input.lesson_id)
              .eq("course_id", input.course_id)
              .eq("tenant_id", tenantId)
              .maybeSingle();
            if (!lesson) return errorResult("Lesson not found in this course");
          }
        }

        const id = randomUUID();
        const { error } = await supabase.from("community_posts").insert({
          id,
          tenant_id: tenantId,
          author_id: session.getUserId(),
          content: input.content.trim(),
          title: input.title?.trim() || null,
          post_type: input.post_type,
          course_id: input.course_id ?? null,
          lesson_id: input.lesson_id ?? null,
          is_graded: input.is_graded,
          due_at: input.due_at ? new Date(input.due_at).toISOString() : null,
        });
        if (error) return errorResult(communityWriteError("post", error));

        const where = input.course_id ? `course ${input.course_id}'s feed` : "the school feed";
        return result(
          {
            post_id: id,
            post_type: input.post_type,
            course_id: input.course_id ?? null,
            lesson_id: input.lesson_id ?? null,
          },
          `Posted a ${input.post_type.replace("_", " ")} in ${where} (id \`${id}\`).`
        );
      })
  );

  // ── lms_create_community_comment ──────────────────────────────────────────
  server.tool(
    {
      name: "lms_create_community_comment",
      description:
        "Comment on a community post as the caller, or reply to a comment (parent_comment_id). A top-level comment is how a student answers a question or a discussion prompt. Refused on locked or removed posts and while the caller is muted. Write only what the user asked to post.",
      inputSchema: CreateCommentInput,
      outputSchema: CreateCommentOutput,
      annotations: WRITE,
    },
    async (input, ctx) =>
      withSession(ctx, async (session) => {
        const invalid = validateComment(input.content);
        if (invalid) return errorResult(invalid);
        const gate = await communityGate(session);
        if (gate) return errorResult(gate);

        const post = await loadVisiblePost(session, input.post_id);
        if (post.is_locked) return errorResult("This post is locked and does not accept new comments");

        const supabase = session.getClient();
        const tenantId = session.getTenantId();
        if (input.parent_comment_id) {
          const { data: parent } = await supabase
            .from("community_comments")
            .select("id")
            .eq("id", input.parent_comment_id)
            .eq("post_id", post.id)
            .eq("tenant_id", tenantId)
            .eq("is_hidden", false)
            .maybeSingle();
          if (!parent) return errorResult("Parent comment not found");
        }

        const id = randomUUID();
        const { error } = await supabase.from("community_comments").insert({
          id,
          post_id: post.id,
          tenant_id: tenantId,
          author_id: session.getUserId(),
          content: input.content.trim(),
          parent_comment_id: input.parent_comment_id ?? null,
        });
        if (error) return errorResult(communityWriteError("comment", error));

        const topLevel = !input.parent_comment_id;
        const kind =
          topLevel && post.post_type === "discussion_prompt"
            ? "Answered the discussion prompt"
            : topLevel && post.post_type === "question"
              ? "Answered the question"
              : topLevel
                ? "Commented"
                : "Replied";
        return result(
          {
            comment_id: id,
            post_id: post.id,
            parent_comment_id: input.parent_comment_id ?? null,
            is_top_level_answer: topLevel && (post.post_type === "discussion_prompt" || post.post_type === "question"),
          },
          `${kind} (comment id \`${id}\`).`
        );
      })
  );

  // ── lms_accept_community_answer ───────────────────────────────────────────
  server.tool(
    {
      name: "lms_accept_community_answer",
      description:
        "Mark a top-level comment as the accepted answer to a question post, or clear it (comment_id null). Only the person who asked or the school's teachers/admins may. The answer's author is notified and earns XP (database-side).",
      inputSchema: AcceptAnswerInput,
      outputSchema: AcceptAnswerOutput,
      annotations: IDEMPOTENT_WRITE,
    },
    async (input, ctx) =>
      withSession(ctx, async (session) => {
        const gate = await communityGate(session);
        if (gate) return errorResult(gate);
        const post = await loadVisiblePost(session, input.post_id);
        if (post.post_type !== "question") return errorResult("Only questions have an accepted answer");
        if (
          !canAcceptAnswers({
            viewerId: session.getUserId(),
            viewerRole: session.getRole(),
            questionAuthorId: post.author_id,
          })
        ) {
          return errorResult("Only the person who asked or a teacher can accept an answer");
        }

        const supabase = session.getClient();
        const tenantId = session.getTenantId();
        if (input.comment_id) {
          const { data: comment } = await supabase
            .from("community_comments")
            .select("id")
            .eq("id", input.comment_id)
            .eq("post_id", post.id)
            .eq("tenant_id", tenantId)
            .is("parent_comment_id", null)
            .eq("is_hidden", false)
            .maybeSingle();
          if (!comment) return errorResult("That answer is no longer available (it must be a top-level comment on this question)");
        }

        // accepted_by / accepted_at are stamped by community_guard_accepted_answer.
        const { data: updated, error } = await supabase
          .from("community_posts")
          .update({ accepted_comment_id: input.comment_id })
          .eq("id", post.id)
          .eq("tenant_id", tenantId)
          .select("id");
        if (error) {
          const key = guardErrorKey(error);
          if (key === "notAllowed") return errorResult("Only the person who asked or a teacher can accept an answer (and not while muted)");
          if (key === "invalid") return errorResult("That answer is no longer available");
          return errorResult(`Accepting the answer: ${error.message}`);
        }
        if (!updated || updated.length === 0) {
          return errorResult("Only the person who asked or a teacher can accept an answer");
        }

        return result(
          { post_id: post.id, accepted_comment_id: input.comment_id },
          input.comment_id ? `Accepted comment \`${input.comment_id}\` as the answer.` : "Cleared the accepted answer."
        );
      })
  );

  // ── lms_list_discussion_prompts ───────────────────────────────────────────
  server.tool(
    {
      name: "lms_list_discussion_prompts",
      description:
        "List a course's discussion prompts (optionally one lesson's) — pinned first, then in the order the teacher asked them. Students see whether they answered and their own grade on graded prompts; teachers/admins see answer and graded counts. Answer a prompt with lms_create_community_comment (top-level).",
      inputSchema: ListPromptsInput,
      outputSchema: ListPromptsOutput,
      annotations: READ,
    },
    async (input, ctx) =>
      withSession(ctx, async (session) => {
        const gate = await communityGate(session);
        if (gate) return errorResult(gate);
        await session.verifyCourseAccess(input.course_id);
        const supabase = session.getClient();
        const tenantId = session.getTenantId();

        let query = supabase
          .from("community_posts")
          .select("id, title, content, lesson_id, is_graded, is_locked, due_at, is_pinned, created_at")
          .eq("tenant_id", tenantId)
          .eq("course_id", input.course_id)
          .eq("post_type", "discussion_prompt")
          .eq("is_hidden", false);
        if (input.lesson_id !== undefined) query = query.eq("lesson_id", input.lesson_id);
        const { data, error } = await query
          .order("is_pinned", { ascending: false })
          .order("created_at", { ascending: true })
          .limit(input.limit);
        if (error) return errorResult(`Loading discussion prompts: ${error.message}`);
        const rows = (data ?? []) as {
          id: string;
          title: string | null;
          content: string;
          lesson_id: number | null;
          is_graded: boolean;
          is_locked: boolean;
          due_at: string | null;
        }[];
        const ids = rows.map((r) => r.id);
        const staff = isStaffRole(session.getRole());

        const answered = new Set<string>();
        const myGrades = new Map<string, z.infer<typeof GradeSchema>>();
        const answerCounts = new Map<string, number>();
        const gradedCounts = new Map<string, number>();

        if (ids.length > 0 && !staff) {
          const [{ data: mine }, { data: grades }] = await Promise.all([
            supabase
              .from("community_comments")
              .select("post_id")
              .eq("tenant_id", tenantId)
              .eq("author_id", session.getUserId())
              .is("parent_comment_id", null)
              .eq("is_hidden", false)
              .in("post_id", ids),
            supabase
              .from("community_prompt_grades")
              .select("post_id, score, feedback, graded_at")
              .eq("tenant_id", tenantId)
              .eq("student_id", session.getUserId())
              .in("post_id", ids),
          ]);
          for (const c of (mine as { post_id: string }[] | null) ?? []) answered.add(c.post_id);
          for (const g of (grades as ({ post_id: string } & z.infer<typeof GradeSchema>)[] | null) ?? []) {
            myGrades.set(g.post_id, { score: g.score, feedback: g.feedback, graded_at: g.graded_at });
          }
        } else if (ids.length > 0) {
          // A head count per prompt (≤ 25): a row fetch would stop at max_rows.
          await Promise.all(
            ids.map(async (postId) => {
              const { count } = await supabase
                .from("community_comments")
                .select("id", { count: "exact", head: true })
                .eq("tenant_id", tenantId)
                .eq("post_id", postId)
                .is("parent_comment_id", null)
                .eq("is_hidden", false);
              answerCounts.set(postId, count ?? 0);
            })
          );
          const gradedIds = rows.filter((r) => r.is_graded).map((r) => r.id);
          await Promise.all(
            gradedIds.map(async (postId) => {
              const { count } = await supabase
                .from("community_prompt_grades")
                .select("id", { count: "exact", head: true })
                .eq("tenant_id", tenantId)
                .eq("post_id", postId);
              gradedCounts.set(postId, count ?? 0);
            })
          );
        }

        const prompts = rows.map((r) => ({
          id: r.id,
          title: r.title,
          excerpt: excerpt(plainMentions(r.content)),
          lesson_id: r.lesson_id,
          is_graded: r.is_graded,
          is_locked: r.is_locked,
          due_at: r.due_at,
          due: describeDue(dueState(r.due_at)),
          answered: staff ? null : answered.has(r.id),
          my_grade: staff ? null : (myGrades.get(r.id) ?? null),
          answer_count: staff ? (answerCounts.get(r.id) ?? 0) : null,
          graded_count: staff && r.is_graded ? (gradedCounts.get(r.id) ?? 0) : null,
        }));

        const text =
          prompts.length === 0
            ? `No discussion prompts in course ${input.course_id}${input.lesson_id ? ` for lesson ${input.lesson_id}` : ""}.`
            : prompts
                .map((p) => {
                  const facts = [
                    p.is_graded ? "graded" : null,
                    p.due,
                    p.is_locked ? "answers closed" : null,
                    p.answered === true ? "you answered" : p.answered === false ? "not answered yet" : null,
                    p.my_grade ? `your grade ${p.my_grade.score}/100` : null,
                    p.answer_count !== null ? `${p.answer_count} answer(s)` : null,
                    p.graded_count !== null ? `${p.graded_count} graded` : null,
                  ].filter(Boolean);
                  return `- ${p.title ? `**${p.title}** — ` : ""}${p.excerpt}${facts.length ? ` (${facts.join(", ")})` : ""} · id \`${p.id}\``;
                })
                .join("\n");
        return result({ course_id: input.course_id, prompts } as z.infer<typeof ListPromptsOutput>, text);
      })
  );

  // ── lms_report_community_content ──────────────────────────────────────────
  server.tool(
    {
      name: "lms_report_community_content",
      description:
        "Report a community post or comment to the school's admins (filed as pending; one pending report per member per item). Allowed while muted, so a member can always report harassment.",
      inputSchema: ReportInput,
      outputSchema: ReportOutput,
      annotations: WRITE,
    },
    async (input, ctx) =>
      withSession(ctx, async (session) => {
        const invalid = validateReportReason(input.reason);
        if (invalid) return errorResult(invalid);
        const { error } = await session
          .getClient()
          .from("community_flags")
          .insert({
            id: randomUUID(),
            tenant_id: session.getTenantId(),
            reporter_id: session.getUserId(),
            reason: input.reason.trim(),
            post_id: input.target_type === "post" ? input.target_id : null,
            comment_id: input.target_type === "comment" ? input.target_id : null,
          });
        if (error) return errorResult(communityWriteError("report", error));
        return result(
          { reported: true, target_type: input.target_type, target_id: input.target_id },
          `Reported the ${input.target_type}. The school's admins will review it.`
        );
      })
  );

  // ── lms_block_community_member / lms_unblock_community_member ─────────────
  server.tool(
    {
      name: "lms_block_community_member",
      description:
        "Block a member: their community posts and comments stop showing for the caller, in every school, and they are never told. Teachers and admins keep seeing everything (they moderate instead).",
      inputSchema: BlockInput,
      outputSchema: BlockOutput,
      annotations: IDEMPOTENT_WRITE,
    },
    async (input, ctx) =>
      withSession(ctx, async (session) => {
        if (input.user_id === session.getUserId()) return errorResult("You cannot block yourself");
        const { error } = await session
          .getClient()
          .from("community_user_blocks")
          .upsert(
            { blocker_id: session.getUserId(), blocked_id: input.user_id },
            { onConflict: "blocker_id,blocked_id", ignoreDuplicates: true }
          );
        if (error) return errorResult(`Blocking: ${error.message}`);
        return result({ user_id: input.user_id, blocked: true }, "Blocked. Their posts and comments are hidden from you.");
      })
  );

  server.tool(
    {
      name: "lms_unblock_community_member",
      description: "Unblock a member the caller blocked; their posts and comments show again.",
      inputSchema: BlockInput,
      outputSchema: BlockOutput,
      annotations: IDEMPOTENT_WRITE,
    },
    async (input, ctx) =>
      withSession(ctx, async (session) => {
        const { error } = await session
          .getClient()
          .from("community_user_blocks")
          .delete()
          .eq("blocker_id", session.getUserId())
          .eq("blocked_id", input.user_id);
        if (error) return errorResult(`Unblocking: ${error.message}`);
        return result({ user_id: input.user_id, blocked: false }, "Unblocked.");
      })
  );

  server.tool(
    {
      name: "lms_list_blocked_members",
      description: "List the members the caller has blocked in the community (blocks are private and apply in every school).",
      inputSchema: z.object({}),
      outputSchema: ListBlocksOutput,
      annotations: READ,
    },
    async (_input, ctx) =>
      withSession(ctx, async (session) => {
        const supabase = session.getClient();
        const { data, error } = await supabase
          .from("community_user_blocks")
          .select("blocked_id, created_at")
          .eq("blocker_id", session.getUserId())
          .order("created_at", { ascending: false });
        if (error) return errorResult(`Loading blocks: ${error.message}`);
        const rows = (data as { blocked_id: string; created_at: string }[] | null) ?? [];
        const names = await profileNames(supabase, rows.map((r) => r.blocked_id));
        const members = rows.map((r) => ({
          user_id: r.blocked_id,
          name: names.get(r.blocked_id) ?? null,
          blocked_at: r.created_at,
        }));
        return result(
          { members },
          members.length === 0
            ? "You have not blocked anyone."
            : members.map((m) => `- ${m.name ?? "a member"} · id \`${m.user_id}\``).join("\n")
        );
      })
  );

  // ── lms_get_prompt_grading_roster (staff) ─────────────────────────────────
  server.tool(
    {
      name: "lms_get_prompt_grading_roster",
      description:
        "Teachers/admins: the grading view of a graded discussion prompt — each student with their answers and current grade, waiting-to-grade first. Course author or admin only. Grade with lms_grade_prompt_answer.",
      inputSchema: RosterInput,
      outputSchema: RosterOutput,
      annotations: READ,
    },
    async (input, ctx) =>
      withSession(ctx, async (session) => {
        if (!isStaffRole(session.getRole())) return errorResult("Only teachers and admins grade discussion prompts");
        const gate = await communityGate(session);
        if (gate) return errorResult(gate);
        await session.verifyCourseOwnership(input.course_id);

        const supabase = session.getClient();
        const tenantId = session.getTenantId();
        const { data: postData, error: postError } = await supabase
          .from("community_posts")
          .select("id, title, content, is_locked, due_at, is_graded, post_type")
          .eq("id", input.post_id)
          .eq("tenant_id", tenantId)
          .eq("course_id", input.course_id)
          .eq("is_hidden", false)
          .maybeSingle();
        if (postError) return errorResult(`Loading the prompt: ${postError.message}`);
        const prompt = postData as {
          id: string;
          title: string | null;
          content: string;
          is_locked: boolean;
          due_at: string | null;
          is_graded: boolean;
          post_type: string;
        } | null;
        if (!prompt || prompt.post_type !== "discussion_prompt" || !prompt.is_graded) {
          return errorResult("This prompt is not graded or no longer exists");
        }

        // Answers: visible top-level comments (a reply to a classmate is not an answer).
        const answers: { id: string; author_id: string; content: string; created_at: string }[] = [];
        for (let from = 0; ; from += 1000) {
          const { data, error } = await supabase
            .from("community_comments")
            .select("id, author_id, content, created_at")
            .eq("tenant_id", tenantId)
            .eq("post_id", prompt.id)
            .is("parent_comment_id", null)
            .eq("is_hidden", false)
            .order("created_at", { ascending: true })
            .range(from, from + 999);
          if (error) return errorResult(`Loading answers: ${error.message}`);
          answers.push(...((data as typeof answers | null) ?? []));
          if (!data || data.length < 1000) break;
        }

        const { data: gradeRows, error: gradesError } = await supabase
          .from("community_prompt_grades")
          .select("student_id, score, feedback, graded_at")
          .eq("tenant_id", tenantId)
          .eq("post_id", prompt.id);
        if (gradesError) return errorResult(`Loading grades: ${gradesError.message}`);
        const grades = new Map<string, z.infer<typeof GradeSchema>>();
        for (const g of (gradeRows as ({ student_id: string } & z.infer<typeof GradeSchema>)[] | null) ?? []) {
          grades.set(g.student_id, { score: g.score, feedback: g.feedback, graded_at: g.graded_at });
        }

        const enrolled: string[] = [];
        for (let from = 0; ; from += 1000) {
          const { data, error } = await supabase
            .from("enrollments")
            .select("user_id")
            .eq("tenant_id", tenantId)
            .eq("course_id", input.course_id)
            .eq("status", "active")
            .range(from, from + 999);
          if (error) break; // the roster still covers everyone who answered or was graded
          enrolled.push(...((data as { user_id: string }[] | null) ?? []).map((r) => r.user_id));
          if (!data || data.length < 1000) break;
        }

        // Only students are graded (the trigger refuses anyone else). Admins can
        // read the school's memberships; a teacher's RLS cannot, so for them the
        // known staff (the course author and the caller) are left out and the
        // database refuses any other non-student at grading time.
        const candidates = new Set<string>([...enrolled, ...answers.map((a) => a.author_id), ...grades.keys()]);
        candidates.delete(session.getUserId());
        if (session.isAdmin()) {
          const ids = [...candidates];
          const students = new Set<string>();
          for (let i = 0; i < ids.length; i += IN_CHUNK) {
            const { data } = await supabase
              .from("tenant_users")
              .select("user_id")
              .eq("tenant_id", tenantId)
              .eq("role", "student")
              .eq("status", "active")
              .in("user_id", ids.slice(i, i + IN_CHUNK));
            for (const r of (data as { user_id: string }[] | null) ?? []) students.add(r.user_id);
          }
          for (const id of ids) if (!students.has(id)) candidates.delete(id);
        } else {
          const { data: course } = await supabase
            .from("courses")
            .select("author_id")
            .eq("course_id", input.course_id)
            .eq("tenant_id", tenantId)
            .maybeSingle();
          const authorId = (course as { author_id: string | null } | null)?.author_id;
          if (authorId) candidates.delete(authorId);
        }

        const names = await profileNames(supabase, [...candidates]);
        const byStudent = new Map<string, { comment_id: string; content: string; created_at: string }[]>();
        for (const a of answers) {
          if (!candidates.has(a.author_id)) continue;
          const list = byStudent.get(a.author_id) ?? [];
          list.push({ comment_id: a.id, content: plainMentions(a.content), created_at: a.created_at });
          byStudent.set(a.author_id, list);
        }
        const roster = sortRoster(
          [...candidates].map((id) => ({
            student_id: id,
            name: names.get(id) ?? null,
            answers: byStudent.get(id) ?? [],
            grade: grades.get(id) ?? null,
          }))
        );
        const counts = rosterCounts(roster);
        const filtered = filterRoster(roster, input.filter);
        const page = filtered.slice(input.offset, input.offset + input.limit).map((r) => ({
          ...r,
          status: gradingStatus(r),
        }));
        const hasMore = filtered.length > input.offset + input.limit;

        const text = [
          `Prompt: ${prompt.title ?? excerpt(prompt.content, 120)}${prompt.due_at ? ` (${describeDue(dueState(prompt.due_at))})` : ""}`,
          `${counts.ungraded} to grade · ${counts.graded} graded · ${counts.unanswered} not answered · ${counts.all} students`,
          page.length === 0
            ? `No students match '${input.filter}'.`
            : page
                .map(
                  (r) =>
                    `- ${r.name ?? "a student"} (\`${r.student_id}\`): ${r.status}${r.grade ? ` ${r.grade.score}/100` : ""}${r.answers.length ? `\n${r.answers.map((a) => `    > ${excerpt(a.content, 400)}`).join("\n")}` : ""}`
                )
                .join("\n"),
          hasMore ? `More: offset=${input.offset + input.limit}` : "",
        ]
          .filter(Boolean)
          .join("\n");

        return result(
          {
            prompt: {
              id: prompt.id,
              course_id: input.course_id,
              title: prompt.title,
              excerpt: excerpt(plainMentions(prompt.content)),
              is_locked: prompt.is_locked,
              due_at: prompt.due_at,
            },
            counts,
            filter: input.filter,
            students: page,
            has_more: hasMore,
          } as z.infer<typeof RosterOutput>,
          text
        );
      })
  );

  // ── lms_grade_prompt_answer (staff) ───────────────────────────────────────
  server.tool(
    {
      name: "lms_grade_prompt_answer",
      description:
        "Teachers/admins: grade one student (0-100, optional feedback) on a graded discussion prompt, or change their grade. One grade per student per prompt. The student is notified and earns XP for an answered prompt (database-side). Course author or admin only. Decide the score with the teacher — never grade on your own initiative.",
      inputSchema: GradeInput,
      outputSchema: SaveGradeOutput,
      annotations: IDEMPOTENT_WRITE,
    },
    async (input, ctx) =>
      withSession(ctx, async (session) => {
        if (!isStaffRole(session.getRole())) return errorResult("Only teachers and admins grade discussion prompts");
        const score = parseGradeScore(input.score);
        if (score === null) return errorResult("The score must be a whole number from 0 to 100");
        const feedback = normalizeGradeFeedback(input.feedback);
        if (feedback === "invalid") return errorResult("Feedback is too long");
        await session.verifyCourseOwnership(input.course_id);

        const supabase = session.getClient();
        const tenantId = session.getTenantId();
        const { data: post } = await supabase
          .from("community_posts")
          .select("id")
          .eq("id", input.post_id)
          .eq("tenant_id", tenantId)
          .eq("course_id", input.course_id)
          .eq("post_type", "discussion_prompt")
          .eq("is_graded", true)
          .eq("is_hidden", false)
          .maybeSingle();
        if (!post) return errorResult("This prompt is not graded or no longer exists");

        const refusal = (error: { code?: string; message?: string }) => {
          const key = guardErrorKey(error);
          if (key === "notAllowed") return "Only the school's teachers and admins can grade this prompt";
          if (key === "invalid") return "This prompt or student can no longer be graded";
          return null;
        };

        // Update first; a first grade inserts. Losing the insert race (23505)
        // means another grader just inserted — update instead (savePromptGrade).
        const COLUMNS = "student_id, score, feedback, graded_at";
        type SavedGrade = { student_id: string; score: number; feedback: string | null; graded_at: string };
        let saved: SavedGrade | null = null;
        for (let attempt = 0; attempt < 2 && !saved; attempt++) {
          const { data: updated, error: updateError } = await supabase
            .from("community_prompt_grades")
            .update({ score, feedback })
            .eq("tenant_id", tenantId)
            .eq("post_id", input.post_id)
            .eq("student_id", input.student_id)
            .select(COLUMNS)
            .maybeSingle();
          if (updateError) return errorResult(refusal(updateError) ?? `Saving the grade: ${updateError.message}`);
          if (updated) {
            saved = updated as SavedGrade;
            break;
          }
          const { data: inserted, error: insertError } = await supabase
            .from("community_prompt_grades")
            .insert({
              tenant_id: tenantId,
              post_id: input.post_id,
              student_id: input.student_id,
              score,
              feedback,
              graded_by: session.getUserId(),
            })
            .select(COLUMNS)
            .single();
          if (insertError) {
            if (insertError.code === "23505") continue;
            return errorResult(refusal(insertError) ?? `Saving the grade: ${insertError.message}`);
          }
          saved = inserted as SavedGrade;
        }
        if (!saved) return errorResult("Failed to save the grade");

        return result(
          { student_id: saved.student_id, score: saved.score, feedback: saved.feedback, graded_at: saved.graded_at },
          `Saved: ${saved.score}/100${saved.feedback ? ` with feedback` : ""}. The student is notified.`
        );
      })
  );

  // ── lms_remove_prompt_grade (staff) ───────────────────────────────────────
  server.tool(
    {
      name: "lms_remove_prompt_grade",
      description:
        "Teachers/admins: withdraw a student's grade on a graded discussion prompt — they are ungraded again and their 'you were graded' notification is withdrawn (XP stays). Course author or admin only.",
      inputSchema: RemoveGradeInput,
      outputSchema: RemoveGradeOutput,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (input, ctx) =>
      withSession(ctx, async (session) => {
        if (!isStaffRole(session.getRole())) return errorResult("Only teachers and admins grade discussion prompts");
        await session.verifyCourseOwnership(input.course_id);
        const supabase = session.getClient();
        const tenantId = session.getTenantId();
        const { data: post } = await supabase
          .from("community_posts")
          .select("id")
          .eq("id", input.post_id)
          .eq("tenant_id", tenantId)
          .eq("course_id", input.course_id)
          .maybeSingle();
        if (!post) return errorResult("This prompt no longer exists");

        const { data, error } = await supabase
          .from("community_prompt_grades")
          .delete()
          .eq("tenant_id", tenantId)
          .eq("post_id", input.post_id)
          .eq("student_id", input.student_id)
          .select("id");
        if (error) {
          const key = guardErrorKey(error);
          return errorResult(
            key === "notAllowed"
              ? "Only the school's teachers and admins can grade this prompt"
              : `Removing the grade: ${error.message}`
          );
        }
        const removed = (data?.length ?? 0) > 0;
        return result(
          { student_id: input.student_id, removed },
          removed ? "Grade removed; the student is ungraded again." : "That student had no grade on this prompt."
        );
      })
  );

  // ── lms_list_community_reports (admin) ────────────────────────────────────
  server.tool(
    {
      name: "lms_list_community_reports",
      description:
        "Admins: the school's community reports (pending by default) with the reported content, its author and the reporter. Reviewing a report and hiding, pinning or locking content are done on the web moderation page (/dashboard/admin/community/moderation); muting is lms_mute_community_member.",
      inputSchema: ListReportsInput,
      outputSchema: ListReportsOutput,
      annotations: READ,
    },
    async (input, ctx) =>
      withSession(ctx, async (session) => {
        if (!session.isAdmin()) return errorResult("Only admins review community reports");
        const supabase = session.getClient();
        const tenantId = session.getTenantId();
        let query = supabase
          .from("community_flags")
          .select("id, reporter_id, post_id, comment_id, reason, status, created_at")
          .eq("tenant_id", tenantId);
        if (input.status !== "all") query = query.eq("status", input.status);
        const { data, error } = await query
          .order("created_at", { ascending: false })
          .range(input.offset, input.offset + input.limit - 1);
        if (error) return errorResult(`Loading reports: ${error.message}`);
        const flags = (data ?? []) as {
          id: string;
          reporter_id: string;
          post_id: string | null;
          comment_id: string | null;
          reason: string;
          status: string;
          created_at: string;
        }[];

        const postIds = flags.map((f) => f.post_id).filter((x): x is string => !!x);
        const commentIds = flags.map((f) => f.comment_id).filter((x): x is string => !!x);
        const [{ data: posts }, { data: comments }] = await Promise.all([
          postIds.length
            ? supabase
                .from("community_posts")
                .select("id, author_id, title, content, post_type, milestone_type, milestone_data, is_hidden")
                .eq("tenant_id", tenantId)
                .in("id", postIds)
            : Promise.resolve({ data: [] }),
          commentIds.length
            ? supabase
                .from("community_comments")
                .select("id, post_id, author_id, content, is_hidden")
                .eq("tenant_id", tenantId)
                .in("id", commentIds)
            : Promise.resolve({ data: [] }),
        ]);
        type P = { id: string; author_id: string; title: string | null; content: string; post_type: string; milestone_type: string | null; milestone_data: unknown; is_hidden: boolean };
        type C = { id: string; post_id: string; author_id: string; content: string; is_hidden: boolean };
        const postMap = new Map(((posts as P[] | null) ?? []).map((p) => [p.id, p]));
        const commentMap = new Map(((comments as C[] | null) ?? []).map((c) => [c.id, c]));

        const names = await profileNames(supabase, [
          ...flags.map((f) => f.reporter_id),
          ...[...postMap.values()].map((p) => p.author_id),
          ...[...commentMap.values()].map((c) => c.author_id),
        ]);

        const reports = flags.map((f) => {
          const isPost = !!f.post_id;
          const p = f.post_id ? postMap.get(f.post_id) : undefined;
          const c = f.comment_id ? commentMap.get(f.comment_id) : undefined;
          const target = isPost ? p : c;
          const text = p ? `${p.title ? `${p.title} — ` : ""}${postText(p)}` : c ? plainMentions(c.content) : null;
          return {
            id: f.id,
            status: f.status,
            reason: f.reason,
            created_at: f.created_at,
            reporter_id: f.reporter_id,
            reporter_name: names.get(f.reporter_id) ?? null,
            target_type: (isPost ? "post" : "comment") as "post" | "comment",
            target_id: (f.post_id ?? f.comment_id) as string,
            post_id: isPost ? f.post_id : (c?.post_id ?? null),
            target_author_id: target?.author_id ?? null,
            target_author_name: target ? (names.get(target.author_id) ?? null) : null,
            target_excerpt: text === null ? null : excerpt(text),
            target_removed: target ? target.is_hidden : null,
          };
        });

        const text =
          reports.length === 0
            ? `No ${input.status === "all" ? "" : `${input.status} `}reports.`
            : reports
                .map(
                  (r) =>
                    `- [${r.status}] ${r.target_type} by ${r.target_author_name ?? "a member"}${r.target_removed ? " (already removed)" : ""}: "${r.target_excerpt ?? "content no longer exists"}"\n  reported by ${r.reporter_name ?? "a member"} on ${r.created_at.slice(0, 10)}: ${excerpt(r.reason, 200)} · report \`${r.id}\``
                )
                .join("\n");
        return result({ status: input.status, reports }, text);
      })
  );

  // ── lms_mute_community_member / lms_unmute_community_member (admin) ───────
  server.tool(
    {
      name: "lms_mute_community_member",
      description:
        "Admins: mute a member of the school's community — they cannot post, comment, react or vote until the mute ends (omit muted_until for indefinite). They can still read and report. Muting again replaces the previous mute.",
      inputSchema: MuteInput,
      outputSchema: MuteOutput,
      annotations: IDEMPOTENT_WRITE,
    },
    async (input, ctx) =>
      withSession(ctx, async (session) => {
        if (!session.isAdmin()) return errorResult("Only admins can mute members");
        if (input.user_id === session.getUserId()) return errorResult("You cannot mute yourself");
        let mutedUntil: string | null = null;
        if (input.muted_until) {
          const ms = Date.parse(input.muted_until);
          if (Number.isNaN(ms)) return errorResult("Invalid muted_until date");
          if (ms <= Date.now()) return errorResult("Mute expiration must be in the future");
          mutedUntil = new Date(ms).toISOString();
        }

        const supabase = session.getClient();
        const tenantId = session.getTenantId();
        const { data: member } = await supabase
          .from("tenant_users")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("user_id", input.user_id)
          .maybeSingle();
        if (!member) return errorResult("User not found in this school");

        const { error } = await supabase.from("community_user_mutes").upsert(
          {
            tenant_id: tenantId,
            user_id: input.user_id,
            muted_by: session.getUserId(),
            reason: input.reason?.trim() || null,
            muted_until: mutedUntil,
          },
          { onConflict: "tenant_id,user_id" }
        );
        if (error) return errorResult(`Muting: ${error.message}`);
        return result(
          { user_id: input.user_id, muted: true, muted_until: mutedUntil },
          `Muted${mutedUntil ? ` until ${mutedUntil}` : " indefinitely"}.`
        );
      })
  );

  server.tool(
    {
      name: "lms_unmute_community_member",
      description: "Admins: lift a member's community mute.",
      inputSchema: BlockInput,
      outputSchema: MuteOutput,
      annotations: IDEMPOTENT_WRITE,
    },
    async (input, ctx) =>
      withSession(ctx, async (session) => {
        if (!session.isAdmin()) return errorResult("Only admins can unmute members");
        const { error } = await session
          .getClient()
          .from("community_user_mutes")
          .delete()
          .eq("tenant_id", session.getTenantId())
          .eq("user_id", input.user_id);
        if (error) return errorResult(`Unmuting: ${error.message}`);
        return result({ user_id: input.user_id, muted: false, muted_until: null }, "Unmuted.");
      })
  );

  server.tool(
    {
      name: "lms_list_community_mutes",
      description: "Admins: the school's community mutes, active ones first.",
      inputSchema: z.object({}),
      outputSchema: ListMutesOutput,
      annotations: READ,
    },
    async (_input, ctx) =>
      withSession(ctx, async (session) => {
        if (!session.isAdmin()) return errorResult("Only admins can see community mutes");
        const supabase = session.getClient();
        const { data, error } = await supabase
          .from("community_user_mutes")
          .select("user_id, reason, muted_until, muted_by, created_at")
          .eq("tenant_id", session.getTenantId())
          .order("created_at", { ascending: false });
        if (error) return errorResult(`Loading mutes: ${error.message}`);
        const rows = (data ?? []) as { user_id: string; reason: string | null; muted_until: string | null; muted_by: string; created_at: string }[];
        const names = await profileNames(supabase, rows.map((r) => r.user_id));
        const now = Date.now();
        const mutes = rows
          .map((r) => ({
            ...r,
            name: names.get(r.user_id) ?? null,
            active: r.muted_until === null || Date.parse(r.muted_until) > now,
          }))
          .sort((a, b) => Number(b.active) - Number(a.active));
        return result(
          { mutes },
          mutes.length === 0
            ? "Nobody is muted."
            : mutes
                .map(
                  (m) =>
                    `- ${m.name ?? "a member"} (\`${m.user_id}\`): ${m.active ? (m.muted_until ? `muted until ${m.muted_until}` : "muted indefinitely") : "expired"}${m.reason ? ` — ${m.reason}` : ""}`
                )
                .join("\n")
        );
      })
  );

  // ── lms_list_banned_members (admin) ───────────────────────────────────────
  server.tool(
    {
      name: "lms_list_banned_members",
      description:
        "Admins: members banned from the school (#892) with when, by whom and why. A banned person cannot rejoin through any join path. Banning and lifting a ban are done on the web Users page — they run through service-role-only database functions that this server never calls; a lifted ban lands on 'removed' (the person may rejoin), never back to active.",
      inputSchema: z.object({}),
      outputSchema: ListBansOutput,
      annotations: READ,
    },
    async (_input, ctx) =>
      withSession(ctx, async (session) => {
        if (!session.isAdmin()) return errorResult("Only admins can see banned members");
        const supabase = session.getClient();
        const { data, error } = await supabase
          .from("tenant_users")
          .select("user_id, role, banned_at, banned_by, ban_reason")
          .eq("tenant_id", session.getTenantId())
          .eq("status", "banned")
          .order("banned_at", { ascending: false });
        if (error) return errorResult(`Loading banned members: ${error.message}`);
        const rows = (data ?? []) as { user_id: string; role: string; banned_at: string | null; banned_by: string | null; ban_reason: string | null }[];
        const names = await profileNames(supabase, rows.map((r) => r.user_id));
        const members = rows.map((r) => ({
          user_id: r.user_id,
          name: names.get(r.user_id) ?? null,
          role: r.role,
          banned_at: r.banned_at,
          banned_by: r.banned_by,
          reason: r.ban_reason,
        }));
        return result(
          { members },
          members.length === 0
            ? "Nobody is banned from this school."
            : members
                .map((m) => `- ${m.name ?? "a member"} (\`${m.user_id}\`, ${m.role}) banned ${m.banned_at?.slice(0, 10) ?? ""}${m.reason ? ` — ${m.reason}` : ""}`)
                .join("\n")
        );
      })
  );
}
