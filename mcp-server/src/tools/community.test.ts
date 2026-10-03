import { describe, it, expect } from "vitest";
import { isToolAllowedForRole } from "../tool-policy.js";
import {
  AcceptAnswerInput,
  CreateCommentInput,
  CreatePostInput,
  GradeInput,
  ListPostsInput,
  MuteInput,
  ReportInput,
  RosterInput,
} from "./community.js";
import {
  canAcceptAnswers,
  communityWriteError,
  describeDue,
  dueState,
  filterRoster,
  guardErrorKey,
  milestoneSentence,
  normalizeGradeFeedback,
  orderThread,
  parseGradeScore,
  plainMentions,
  rosterCounts,
  sortRoster,
  validateComment,
  validateNewPost,
  validateReportReason,
} from "./community-rules.js";

/**
 * Community + moderation tools (#896). The database is the authority on every
 * write (RLS + triggers since #846/#873/#875); what is pinned here is the role
 * gating, the input schemas, and the friendly pre-checks that mirror the web
 * actions.
 */

const SEEDED = "00000000-0000-0000-0000-000000000001";
const OTHER = "11111111-2222-3333-4444-555555555555";

const MEMBER_TOOLS = [
  "lms_list_community_posts",
  "lms_get_community_post",
  "lms_create_community_post",
  "lms_create_community_comment",
  "lms_accept_community_answer",
  "lms_list_discussion_prompts",
  "lms_report_community_content",
  "lms_block_community_member",
  "lms_unblock_community_member",
  "lms_list_blocked_members",
];
const GRADING_TOOLS = ["lms_get_prompt_grading_roster", "lms_grade_prompt_answer", "lms_remove_prompt_grade"];
const ADMIN_TOOLS = [
  "lms_list_community_reports",
  "lms_mute_community_member",
  "lms_unmute_community_member",
  "lms_list_community_mutes",
  "lms_list_banned_members",
];

describe("community tool policy", () => {
  it("students get the self-scoped member tools only", () => {
    for (const t of MEMBER_TOOLS) expect(isToolAllowedForRole("student", t), t).toBe(true);
    for (const t of [...GRADING_TOOLS, ...ADMIN_TOOLS]) expect(isToolAllowedForRole("student", t), t).toBe(false);
  });

  it("teachers get member + grading tools, never moderation or bans", () => {
    for (const t of [...MEMBER_TOOLS, ...GRADING_TOOLS]) expect(isToolAllowedForRole("teacher", t), t).toBe(true);
    for (const t of ADMIN_TOOLS) expect(isToolAllowedForRole("teacher", t), t).toBe(false);
  });

  it("admins get everything", () => {
    for (const t of [...MEMBER_TOOLS, ...GRADING_TOOLS, ...ADMIN_TOOLS]) {
      expect(isToolAllowedForRole("admin", t), t).toBe(true);
    }
  });

  it("no role, no tools", () => {
    expect(isToolAllowedForRole(undefined, "lms_list_community_posts")).toBe(false);
  });
});

describe("community input schemas", () => {
  it("accepts the seeded (non-RFC) uuids the app uses", () => {
    expect(CreateCommentInput.safeParse({ post_id: SEEDED, content: "hi" }).success).toBe(true);
    expect(CreateCommentInput.safeParse({ post_id: "not-a-uuid", content: "hi" }).success).toBe(false);
  });

  it("caps post and comment length like the web actions", () => {
    expect(CreatePostInput.safeParse({ content: "x".repeat(5000) }).success).toBe(true);
    expect(CreatePostInput.safeParse({ content: "x".repeat(5001) }).success).toBe(false);
    expect(CreateCommentInput.safeParse({ post_id: SEEDED, content: "x".repeat(2001) }).success).toBe(false);
  });

  it("never lets a client create a poll or milestone post", () => {
    expect(CreatePostInput.safeParse({ content: "x", post_type: "milestone" }).success).toBe(false);
    expect(CreatePostInput.safeParse({ content: "x", post_type: "poll" }).success).toBe(false);
    expect(CreatePostInput.parse({ content: "x" }).post_type).toBe("standard");
  });

  it("accept answer takes null to clear", () => {
    expect(AcceptAnswerInput.safeParse({ post_id: SEEDED, comment_id: null }).success).toBe(true);
    expect(AcceptAnswerInput.safeParse({ post_id: SEEDED }).success).toBe(false);
  });

  it("grades are whole numbers 0-100", () => {
    const base = { course_id: 1, post_id: SEEDED, student_id: OTHER };
    expect(GradeInput.safeParse({ ...base, score: 100 }).success).toBe(true);
    expect(GradeInput.safeParse({ ...base, score: 101 }).success).toBe(false);
    expect(GradeInput.safeParse({ ...base, score: 9.5 }).success).toBe(false);
    expect(GradeInput.safeParse({ ...base, score: 50, feedback: "x".repeat(5001) }).success).toBe(false);
  });

  it("reports need a 1-1000 character reason and a post or comment", () => {
    expect(ReportInput.safeParse({ target_type: "post", target_id: SEEDED, reason: "spam" }).success).toBe(true);
    expect(ReportInput.safeParse({ target_type: "post", target_id: SEEDED, reason: "" }).success).toBe(false);
    expect(ReportInput.safeParse({ target_type: "user", target_id: SEEDED, reason: "x" }).success).toBe(false);
  });

  it("list and roster defaults", () => {
    expect(ListPostsInput.parse({})).toMatchObject({ limit: 20, offset: 0 });
    expect(ListPostsInput.safeParse({ limit: 51 }).success).toBe(false);
    expect(RosterInput.parse({ course_id: 1, post_id: SEEDED }).filter).toBe("all");
    expect(MuteInput.safeParse({ user_id: SEEDED }).success).toBe(true);
  });
});

describe("validateNewPost", () => {
  it("students may post and ask, never prompt or grade", () => {
    expect(validateNewPost({ role: "student", post_type: "standard", content: "hi" })).toBeNull();
    expect(validateNewPost({ role: "student", post_type: "question", content: "why?" })).toBeNull();
    expect(validateNewPost({ role: "student", post_type: "discussion_prompt", content: "x" })).toMatch(/teachers and admins/);
    expect(validateNewPost({ role: "student", post_type: "standard", content: "x", is_graded: true })).toMatch(/teachers and admins/);
  });

  it("a graded prompt needs a course; a due date needs a graded prompt", () => {
    expect(validateNewPost({ role: "teacher", post_type: "discussion_prompt", content: "x", is_graded: true })).toMatch(/needs a course/);
    expect(
      validateNewPost({ role: "teacher", post_type: "discussion_prompt", content: "x", is_graded: true, course_id: 3, due_at: "2026-12-01T00:00:00Z" })
    ).toBeNull();
    expect(
      validateNewPost({ role: "teacher", post_type: "discussion_prompt", content: "x", course_id: 3, due_at: "2026-12-01" })
    ).toMatch(/due date/);
    expect(
      validateNewPost({ role: "teacher", post_type: "discussion_prompt", content: "x", is_graded: true, course_id: 3, due_at: "soon" })
    ).toMatch(/Invalid due date/);
    expect(validateNewPost({ role: "admin", post_type: "standard", content: "x", is_graded: true, course_id: 3 })).toMatch(
      /Only discussion prompts/
    );
  });

  it("blank content and a lesson without a course are refused", () => {
    expect(validateNewPost({ role: "teacher", post_type: "standard", content: "   " })).toMatch(/required/);
    expect(validateNewPost({ role: "teacher", post_type: "standard", content: "x", lesson_id: 4 })).toMatch(/lesson needs a course/);
  });
});

describe("small validators and error mapping", () => {
  it("comments and reports", () => {
    expect(validateComment(" ")).toMatch(/required/);
    expect(validateComment("ok")).toBeNull();
    expect(validateReportReason("  ")).toMatch(/Reason/);
    expect(validateReportReason("abuse")).toBeNull();
  });

  it("accepting answers: the asker or staff", () => {
    expect(canAcceptAnswers({ viewerId: "a", viewerRole: "student", questionAuthorId: "a" })).toBe(true);
    expect(canAcceptAnswers({ viewerId: "b", viewerRole: "student", questionAuthorId: "a" })).toBe(false);
    expect(canAcceptAnswers({ viewerId: "b", viewerRole: "teacher", questionAuthorId: "a" })).toBe(true);
  });

  it("grade score and feedback parsing mirror lib/community/prompt-grades", () => {
    expect(parseGradeScore(0)).toBe(0);
    expect(parseGradeScore("85")).toBe(85);
    expect(parseGradeScore(101)).toBeNull();
    expect(parseGradeScore("8.5")).toBeNull();
    expect(normalizeGradeFeedback("  ")).toBeNull();
    expect(normalizeGradeFeedback(" good ")).toBe("good");
    expect(normalizeGradeFeedback("x".repeat(5001))).toBe("invalid");
  });

  it("trigger SQLSTATEs map to who/what", () => {
    expect(guardErrorKey({ code: "42501" })).toBe("notAllowed");
    expect(guardErrorKey({ code: "23514" })).toBe("invalid");
    expect(guardErrorKey({ code: "P0001" })).toBeNull();
    expect(guardErrorKey(null)).toBeNull();
  });

  it("RLS refusals read as the community rules, duplicates as already reported", () => {
    expect(communityWriteError("post", { code: "42501" })).toMatch(/muted/);
    expect(communityWriteError("comment", { code: "42501" })).toMatch(/locked/);
    expect(communityWriteError("report", { code: "23505" })).toMatch(/already have a pending report/);
    expect(communityWriteError("comment", { code: "P0001", message: "Comment nesting depth exceeds maximum of 5 levels" })).toMatch(
      /nesting depth/
    );
  });
});

describe("display helpers", () => {
  it("milestone sentences", () => {
    expect(milestoneSentence("course_completion", { course_title: "SQL", certificate: true })).toBe(
      'Completed "SQL" and earned the certificate'
    );
    expect(milestoneSentence("level_up", { level: 5 })).toBe("Reached level 5");
    expect(milestoneSentence("streak", { days: 30 })).toBe("Kept a 30-day streak");
    expect(milestoneSentence("weird", null)).toBe("Reached a milestone");
  });

  it("mention tokens read as @Name", () => {
    expect(plainMentions(`hi [@Ana Ruiz](mention:${OTHER})!`)).toBe("hi @Ana Ruiz!");
  });

  it("due states", () => {
    const now = Date.parse("2026-10-01T12:00:00Z");
    expect(describeDue(dueState(null, now))).toBeNull();
    expect(describeDue(dueState("2026-10-01T11:00:00Z", now))).toBe("past due");
    expect(describeDue(dueState("2026-10-01T20:00:00Z", now))).toBe("due today");
    expect(describeDue(dueState("2026-10-04T12:00:00Z", now))).toBe("due in 3 days");
  });

  it("orders a question thread: accepted, then helpful, replies under their parent", () => {
    const c = (id: string, parent: string | null, at: string, helpful = 0, accepted = false) => ({
      id,
      parent_comment_id: parent,
      author_name: null,
      content: id,
      created_at: at,
      helpful_count: helpful,
      is_accepted: accepted,
    });
    const thread = orderThread(
      [
        c("a", null, "2026-01-01T00:00:00Z"),
        c("b", null, "2026-01-02T00:00:00Z", 3),
        c("c", null, "2026-01-03T00:00:00Z", 0, true),
        c("a1", "a", "2026-01-04T00:00:00Z"),
        c("orphan", "gone", "2026-01-05T00:00:00Z"),
      ],
      true
    );
    expect(thread.map((t) => `${t.id}:${t.depth}`)).toEqual(["c:0", "b:0", "a:0", "a1:1", "orphan:0"]);
    // Not a question: chronological roots.
    expect(orderThread([c("y", null, "2026-01-02T00:00:00Z", 9), c("x", null, "2026-01-01T00:00:00Z")], false).map((t) => t.id)).toEqual([
      "x",
      "y",
    ]);
  });

  it("grading roster: waiting first, then graded, then unanswered", () => {
    const rows = [
      { student_id: "3", name: "Zoe", answers: [], grade: null },
      { student_id: "2", name: "Bea", answers: [{}], grade: { score: 90 } },
      { student_id: "1", name: "Ana", answers: [{}], grade: null },
    ];
    expect(sortRoster(rows).map((r) => r.name)).toEqual(["Ana", "Bea", "Zoe"]);
    expect(rosterCounts(rows)).toEqual({ all: 3, ungraded: 1, graded: 1, unanswered: 1 });
    expect(filterRoster(rows, "unanswered").map((r) => r.name)).toEqual(["Zoe"]);
  });
});
