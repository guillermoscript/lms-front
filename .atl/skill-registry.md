## Skill Registry — lms-front

Generated: 2026-05-30

### Compact Rules

**supabase**:
- Use `@supabase/ssr` for server-side clients in Next.js App Router
- `createClient()` from `@/lib/supabase/server` for server components
- Always filter by `tenant_id` on all tenant-scoped queries (RLS enabled but explicit filters required)
- After tenant switch → call `supabase.auth.refreshSession()`
- JWT claims injected by `custom_access_token_hook()` DB function

**next-best-practices**:
- App Router conventions — Server Components by default
- Middleware lives in `proxy.ts` (NOT `middleware.ts`)
- Use `next-intl` for i18n (en/es locale files in `messages/`)

**tailwind-design-system**:
- Tailwind CSS v4 + Shadcn UI (base-mira theme)
- Use `clsx` + `tailwind-merge` for conditional classes

**web-design-guidelines** (project-level in `skills/`):
- Trigger: reviewing UI, checking accessibility, auditing design
- Usage: `/web-design-guidelines <file-or-pattern>`

### User Skills Trigger Table

| Skill | Triggers |
|-------|----------|
| `supabase` | supabase, RLS, auth, database, migrations |
| `nextjs-supabase-auth` | supabase auth, login, protected route |
| `next-best-practices` | Next.js, App Router, RSC |
| `impeccable` | design, redesign, UI, frontend |
| `web-design-guidelines` | review UI, accessibility, audit |
| `vercel-react-best-practices` | React patterns, TypeScript |
| `tailwind-design-system` | Tailwind, design system |
| `brainstorming` | feature, build, create, add |
| `superpowers:test-driven-development` | implement, TDD, tests first |
| `superpowers:systematic-debugging` | bug, error, failing |
| `branch-pr` | PR, pull request, commit |
| `sdd-new` | new change, SDD |
| `postgresql-table-design` | schema design, table |
| `shadcn` | shadcn, components.json |
| `security-review` | security, RLS, audit |
