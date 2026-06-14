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
  the LMS `custom_access_token_hook`. Only `teacher`/`admin` may use the server.
- **Audit:** an `mcp:tools/call` middleware logs every call to `mcp_audit_log`
  via a service-role client (no-op if `SUPABASE_SERVICE_ROLE_KEY` is unset).

## What it exposes

- **39 tools** (`lms_*`) across courses, lessons, exercises, exams, analytics.
- **4 widgets** (MCP Apps): `course-dashboard` (← `lms_list_courses`),
  `course-detail` (← `lms_get_course`, with a live "Load stats" action),
  `exam-submissions` (← `lms_list_exam_submissions`, drill into a submission),
  `lesson-preview` (← `lms_get_lesson`).
- **3 resource templates:** `course://{id}`, `lesson://{id}`, `exam://{id}`.
- **4 prompts:** create-course-outline, generate-lesson-content,
  create-exam-questions, review-course.

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
