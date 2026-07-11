# LMS MCP Server

Course-management tools, resources, prompts, and interactive widgets for the
multi-tenant LMS, exposed to AI agents over the Model Context Protocol.

Built with **[mcp-use](https://docs.mcp-use.com/typescript/server)** + **MCP Apps**
(OpenAI Apps SDK widgets). Replaces the previous `@modelcontextprotocol/sdk`
implementation.

## Architecture

- **Auth:** Supabase OAuth 2.1 (`oauthSupabaseProvider`). Clients authenticate
  against Supabase; this server only verifies the resulting JWT.
- **Data access:** every tool runs queries with a request-scoped Supabase client
  carrying the caller's access token, so **Postgres RLS enforces tenant
  isolation and ownership**. The server holds no elevated data privileges.
- **Tenant/role:** read from JWT claims (`tenant_id`, `tenant_role`) injected by
  the LMS `custom_access_token_hook`. `teacher`/`admin` get the management
  tools; `student` gets only the 18 self-scoped learning/practice tools (list
  hiding in `src/tool-policy.ts`, call-time gating in `src/register.ts`).
- **Audit:** an `mcp:tools/call` middleware logs every call to `mcp_audit_log`
  via a service-role client (no-op if `SUPABASE_SERVICE_ROLE_KEY` is unset).

## What it exposes

- **75 tools** (`lms_*`) across courses, lessons, exercises, exams, analytics,
  student learning (`lms_my_learning`, `lms_view_lesson`,
  `lms_complete_lesson`, `lms_my_exam_results`, `lms_my_gamification`,
  `lms_browse_catalog`), AI-tutor practice (`lms_get_exercise_for_student`
  with attempt history, `lms_complete_exercise` for host-graded text +
  real_time_conversation exercises, `lms_practice_quiz`,
  `lms_record_practice_attempt`, `lms_get_my_weak_spots`,
  `lms_get_tutor_config`), course ingest (`lms_get_course_content` paginated
  bulk pull, `lms_search_content` snippet search over entitled courses),
  mock exams (`lms_get_mock_exam_source` — missed questions + rubrics from
  the caller's own submitted exams only), shared tutor memory
  (`lms_get_tutor_history`, `lms_record_tutor_session` — same
  `aristotle_sessions` table the in-app tutor uses), self-enrollment
  (`lms_enroll_in_course` via the `self_enroll_subscription_course` RPC),
  exam readiness (`lms_get_exam_readiness` — per-topic mastery + weighted
  readiness score from the caller's own history), and the teacher coaching
  loop (`lms_get_confusion_hotspots` — where students collectively struggle,
  ranked by severity; `lms_duplicate_exercise` — copy an exercise as a draft
  variation for remediation), flashcards with SM-2 spaced repetition
  (`lms_create_review_cards`, `lms_get_due_reviews`, `lms_grade_review` —
  scheduling math runs server-side), weekly study plans (`lms_set_study_plan`
  replace-per-week, `lms_get_study_plan` with next-lesson + due-card context,
  `lms_complete_study_goal`), and consented teacher escalation
  (`lms_ask_teacher` — notifies the course's teacher via a SECURITY DEFINER
  RPC, enrollment-validated and rate-limited to 3/day/course).
- **17 widgets** (MCP Apps), teacher/admin: `course-dashboard`
  (← `lms_list_courses`), `course-detail` (← `lms_get_course`, with a live
  "Load stats" action), `exam-submissions` (← `lms_list_exam_submissions`,
  drill into a submission), `lesson-preview` (← `lms_get_lesson`),
  `artifact-sandbox`, `submission-grader`, `student-progress-roster`,
  `school-overview`; student: `my-learning` (← `lms_my_learning`),
  `lesson-viewer` (← `lms_view_lesson`, mark-complete button calls
  `lms_complete_lesson`, "I don't understand" button hands off to the tutor),
  `my-exam-results` (← `lms_my_exam_results`),
  `gamification-profile` (← `lms_my_gamification`), `course-catalog`
  (← `lms_browse_catalog`), `practice-player` (← `lms_practice_quiz`:
  answers in-widget, grades closed types locally, records via
  `lms_record_practice_attempt`, free-text answers go back to the host),
  `exam-readiness` (← `lms_get_exam_readiness`: readiness dial, component
  breakdown, per-topic mastery bars with "Practice this" launch buttons),
  `flashcards` (← `lms_get_due_reviews`: flip-card review session,
  Again/Hard/Good/Easy self-rating → `lms_grade_review`, end-of-session
  summary with a drill-my-misses action), `study-plan`
  (← `lms_get_study_plan`: weekly progress ring, kind-grouped goal checklist
  with check-off → `lms_complete_study_goal`, plan-next-week action).
- **3 resource templates:** `course://{id}`, `lesson://{id}`, `exam://{id}`.
- **12 prompts:** create-course-outline, generate-lesson-content,
  create-exam-questions, review-course, generate-remediation-exercises,
  socratic-tutor, drill-coach, explain-my-mistake, exam-prep-session,
  daily-review, conversation-practice, mock-exam.

## Develop

```bash
cp .env.example .env   # fill in Supabase OAuth values
npm install
npm run dev            # server + inspector at http://localhost:3000/inspector
```

Verify a widget without the UI:

```bash
npx mcp-use client connect dev http://localhost:3000/mcp
npx mcp-use client dev tools call lms_list_courses --screenshot
```

## Build & run

```bash
npm run build          # mcp-use build (compiles widgets + server to dist/)
npm start              # mcp-use start
# or: npm run deploy
docker build -t lms-mcp-server . && docker run -p 3000:3000 --env-file .env lms-mcp-server
```

## Supabase OAuth setup (one-time, in the dashboard)

1. **Authentication → OAuth Server** — enable the OAuth 2.1 server.
2. Set the **consent screen URL** to `<MCP_SERVER_URL>/auth/consent` (this
   server hosts that route — see `src/auth-routes.ts`).
3. **Authentication → Sign In / Providers** — enable at least one method
   (email/password, magic link, or anonymous for demos).
4. Copy the **publishable key** into `MCP_USE_OAUTH_SUPABASE_PUBLISHABLE_KEY`.

See [docs](https://docs.mcp-use.com/typescript/server) and the
`mcp-apps-builder` skill (bundled under `.claude/skills/`) for details.

## Layout

```
index.ts              # server: oauth, audit, registrations
src/env.ts            # env resolution
src/supabase.ts       # request-scoped (RLS) + service-role clients
src/session.ts        # LmsSession — identity, tenant, ownership guards
src/format.ts         # response helpers (ok/okText/errorResult) + pagination
src/audit.ts          # mcp:tools/call audit middleware
src/auth-routes.ts    # Supabase OAuth consent UI route
src/tools/*.ts        # courses, lessons, exercises, exams, analytics
src/resources.ts      # course/lesson/exam resource templates
src/prompts.ts        # prompt templates
resources/<widget>/   # React widgets (MCP Apps)
```
