# Run the LMS MCP server in Claude Desktop + persona testing

Local walkthrough for connecting Claude Desktop to the LMS MCP server and
exercising it as different user personas (admin / teacher / student).

## 1. Prerequisites running

```bash
# a) Local Supabase (OAuth server enabled, seed data loaded)
supabase start

# b) MCP server (port 3000) — keep this terminal open
cd mcp-server && npm run dev
```

The Claude Desktop config already has an `lms` entry (added to
`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
"lms": {
  "command": "/opt/homebrew/bin/npx",
  "args": ["-y", "mcp-remote", "http://localhost:3000/mcp"]
}
```

`mcp-remote` bridges Claude Desktop (stdio) ↔ the HTTP server and runs the
Supabase OAuth dance, caching the token under `~/.mcp-auth`.

## 2. Connect + sign in

1. **Fully quit and reopen Claude Desktop** (Cmd-Q, not just close window) so it
   reloads the config.
2. First time you use an `lms` tool, a browser opens the consent page
   (**"Sign in — LMS MCP"** at `http://127.0.0.1:3000/auth/consent`).
3. Sign in with the account for the persona you want to test (below), then
   **Allow**. The token caches; the chat now has the `lms_*` tools.

> Only **teacher** and **admin** accounts can use the server. A student token
> authenticates but every tool is rejected.

## 3. Switch persona (re-auth as a different user)

The token is cached per server. To become a different persona:

```bash
rm -rf ~/.mcp-auth        # clear cached OAuth token
# then fully quit + reopen Claude Desktop, use an lms tool, sign in as the new user
```

## Test accounts (local seed, password `password123`)

| Persona | Email | Role (Code Academy) | Sees in tools/list | Can call |
|---|---|---|---|---|
| **Admin** | `creator@codeacademy.com` | admin | all 42 tools | everything (all courses in tenant) |
| **Teacher** | *(none seeded — promote one)* | teacher | 36 tools (delete/archive hidden) | own-course CRUD + analytics; NO delete/archive |
| **Student** | `alice@student.com` | student | 0 tools | nothing — "only teachers and admins" |

To get a teacher locally, promote an account once:

```sql
update tenant_users set role='teacher'
where user_id = (select id from auth.users where email='alice@student.com')
  and tenant_id = '00000000-0000-0000-0000-000000000002';
-- revert later: set role='student'
```

(Roles come from `tenant_users` via `custom_access_token_hook` → re-sign-in to
refresh the token after changing a role.)

## 4. Persona prompts to paste into Claude Desktop

### Admin (`creator@codeacademy.com`)
- "Give me a school overview." → `school-overview` widget: cross-course KPIs (students, completion, exam avg, at-risk) + per-course breakdown. **Admin only** — a teacher is rejected.
- "List all courses in my school."
- "Show stats for the Python for Beginners course." → enrollment, completion %, exam stats
- "Who's enrolled in Python for Beginners?" → student names + status
- "Show me the student progress roster for Python for Beginners." → `student-progress-roster` widget: per-student lesson %, exam avg, last active, at-risk flags
- "Show me the submissions for the Python final exam, then open the first one."  → exam-submissions widget + drill-in
- "Grade Alice's Python final exam submission."  → `submission-grader` widget: per-question answers + AI scores, then override score + feedback (marks it teacher-reviewed, syncs exam_scores)
- "Create a draft course called 'Intro to SQL', then add a lesson 'SELECT basics' at position 1."
- "Archive the Data Analysis course." → allowed for admin
- "Build a code-editor artifact exercise for the Python course, then preview it." → `artifact-sandbox` widget: live iframe render + editable HTML + Save

### Teacher (promoted account)
- "List my courses." → only courses you authored (RLS-scoped)
- "Create a new lesson under my course and publish it."
- "Preview the artifact exercise I just made." → `artifact-sandbox` widget, scoped to YOUR exercises (ownership-checked)
- "Archive my course." → **rejected**: "not available for your role"
- "Delete exam 5." → **rejected** (destructive ops are admin-only)
- "Show submissions for my exam." → allowed, but only for YOUR courses

### Student (`alice@student.com`)
- "List the courses." → **rejected**: "only teachers and admins can use the LMS MCP server"
- (Every `lms_*` tool is hidden and rejected.)

## 5. What enforces what

- **Tenant isolation + ownership** → Postgres RLS (queries run as the signed-in
  user; cross-tenant rows simply don't exist to them).
- **Role gating** (`student` blocked, teacher can't delete/archive) → tool
  hidden in `tools/list` + rejected at call time (`src/register.ts`,
  `src/tool-policy.ts`).
- **Audit** → every call logged to `mcp_audit_log` (tool name, args, role,
  success, duration). Inspect:
  ```sql
  select user_role, tool_name, success, duration_ms, created_at
  from mcp_audit_log order by created_at desc limit 20;
  ```

## 6. Widget roadmap (per persona)

The server only serves **admin** and **teacher** (students get 0 tools), so every
widget targets one of two jobs: admin = *run the school*, teacher = *build &
grade faster*. Current widgets are all read/browse; the leverage is closing
authoring & grading loops inside the widget via `useCallTool`.

**Shipped:** `course-dashboard`, `course-detail`, `exam-submissions`,
`lesson-preview`, **`artifact-sandbox`** (teacher — live preview + edit/save of
artifact HTML; reuses `lms_preview_artifact` + `lms_update_artifact_exercise`),
**`submission-grader`** (teacher — per-question answers + AI scores + score/feedback
override; `lms_get_submission_for_grading` reads + merges
`exam_question_scores`/`exam_answers`/`ai_data`, `lms_grade_submission` writes
`exam_submissions` + upserts `exam_scores` via RLS, marks `teacher_reviewed`).

**Tier 1 — reuse existing tools (frontend only):**
- **Exam Builder/Preview** (teacher) — `lms_get_exam` + add/update/delete question.
- **MDX Component Playground** (teacher) — `lms_list_mdx_components` + `lms_update_lesson_content`.
- **Template Gallery** (teacher) — `lms_list_templates` + `lms_create_exercise`.
- **Lesson Publish Timeline** (both) — `lms_list_lessons` + `lms_schedule_lesson`.

Also shipped: **`student-progress-roster`** (both — per-course roster via
`lms_get_student_progress`: lesson %, exam avg, last active, at-risk sort/filter.
NB: `lesson_completions` RLS keys off the *global* `user_roles` role, so a caller
without a global teacher/admin row sees 0% progress — same limitation as
`lms_get_course_stats`).

Also shipped: **`school-overview`** (admin-only — `lms_get_school_stats`, gated via
`TEACHER_DENY_TOOLS`: cross-course KPIs + per-course breakdown, computed with bulk
no-N+1 queries; shares the `lesson_completions` global-role RLS caveat above).

**Tier 2 — next, highest leverage:**
- **Per-question override** (teacher) — extend `submission-grader` with inline
  per-question point edits via the existing `override_exam_score(score_id, …)` RPC
  (current grader overrides the overall score only).
- **Exam Builder/Preview** & **MDX Component Playground** (teacher, Tier 1) — the
  remaining authoring widgets; both reuse existing tools, frontend-only.

**Strategic:** the **student** persona is a deliberate dead end (0 tools). A student
that *does* something needs a separate read-only MCP surface (my-courses,
my-progress, next-lesson, submit-exercise) — a product decision, not a widget.
```
