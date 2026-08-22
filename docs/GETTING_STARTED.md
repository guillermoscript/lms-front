# Getting Started

Everything a new developer needs to get this project running locally: install, environment, database, seed data, dev server, and tests.

Target: a working app with real data in ~10 minutes.

---

## 1. What you are running

A **multi-tenant SaaS LMS**. One Next.js app serves many schools ("tenants"), each on its own subdomain (`code-academy.lvh.me:3000`). Data is isolated per tenant by Postgres **RLS**, so components query Supabase directly instead of going through an API layer.

Five things worth knowing before the first run:

| | |
|--|--|
| **Middleware** | `proxy.ts` is the **only** middleware file. It resolves the tenant from the subdomain, injects `x-tenant-id` / `x-user-id` headers, and enforces role routing. Never create `middleware.ts`. |
| **Tenancy** | The subdomain *is* the tenant. `lvh.me:3000` → Default School, `code-academy.lvh.me:3000` → Code Academy Pro. |
| **Roles** | `student` / `teacher` / `admin`, stored per tenant in `tenant_users` (authoritative), mirrored into the JWT by `custom_access_token_hook()`. |
| **Routes** | Everything lives under `app/[locale]/…` where locale is `en` or `es`. |
| **Data access** | Reads = direct RLS queries. Server actions (`app/actions/`) only for multi-step mutations, service-role work, and external APIs (Stripe, email). |

Full architecture reference: [`CLAUDE.md`](../CLAUDE.md) · [`docs/PROJECT_OVERVIEW.md`](./PROJECT_OVERVIEW.md)

---

## 2. Prerequisites

| Tool | Version | Notes |
|--|--|--|
| Node.js | 20+ (26 works) | Next 16 / React 19 |
| npm | 10+ | The repo uses npm **workspaces** (`packages/*`) — don't swap to pnpm/yarn |
| Docker Desktop | running | Required by local Supabase |
| Supabase CLI | 2.80+ | `brew install supabase/tap/supabase` or `npm i -g supabase` |
| Stripe CLI | optional | Only to test webhooks locally |

Verify:

```bash
node --version && npm --version && docker --version && supabase --version
```

---

## 3. Install

```bash
git clone <repo-url>
cd lms-front
npm install
```

`npm install` also links the `@lms/core` workspace in `packages/core` (shared logic with the sibling Expo app). The `mcp-server/` sub-project has its **own** `package.json` and is only needed if you work on MCP — see §10.

---

## 4. Environment (`.env.local`)

```bash
cp .env.example .env.local
```

`.env.example` is fully annotated with Required / Optional / Has-Default per variable. For a **local Supabase** setup, these four are all you need:

```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY=<Publishable key>
SUPABASE_SERVICE_ROLE_KEY=<Secret key>
NEXT_PUBLIC_PLATFORM_DOMAIN=lvh.me:3000
```

Get the two keys from the **🔑 Authentication Keys** table printed by `supabase status` (step 5) — or by `supabase start` on first boot. They are the standard local-only dev keys: identical on every machine and worthless outside your laptop, but still don't paste them into anything that gets committed.

Recommended extras for local work:

```bash
NEXT_PUBLIC_APP_URL=http://lvh.me:3000
CRON_SECRET=local-dev-secret      # without it, every /api/cron/* request is rejected
```

Everything else (Stripe, OpenAI, Mailgun, PayPal, Solana, Binance, Lemon Squeezy, Langfuse) is optional — the app boots without them and only the corresponding feature is unavailable.

> **Never commit `.env.local`.** It is gitignored. `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS entirely and is server-only.

---

## 5. Start the database

```bash
supabase start      # boots Postgres, Auth, Storage, Studio in Docker (first run pulls images, a few minutes)
npm run db:reset    # = supabase db reset — applies all 168 migrations, then runs supabase/seed.sql
```

`supabase status` should then print:

| Service | URL |
|--|--|
| API | http://127.0.0.1:54321 |
| Database | postgresql://postgres:postgres@127.0.0.1:54322/postgres |
| Studio (table editor / SQL) | http://127.0.0.1:54323 |
| Mailpit (outgoing email inbox) | http://127.0.0.1:54324 |

**`npm run db:reset` is the command you will use most.** It drops the local database, replays every migration in `supabase/migrations/`, then loads the seed. It is destructive to local data only — never point it at cloud.

There is no psql binary requirement; to run SQL from the terminal use:

```bash
docker exec -i supabase_db_lms-front psql -U postgres -d postgres -c "select * from tenants;"
```

---

## 6. Run the app

```bash
npm run dev
```

Then open **`http://lvh.me:3000`** — **not** `localhost:3000`.

`lvh.me` is a public DNS name where `*.lvh.me` resolves to `127.0.0.1`. Tenant resolution reads the subdomain, so on `localhost` no tenant resolves, every authenticated request falls back to the default tenant, and you get bounced to `/join-school`. Use `lvh.me` for everything, always.

| URL | What you get |
|--|--|
| http://lvh.me:3000 | Default School (free plan — all upgrade gates active) |
| http://code-academy.lvh.me:3000 | Code Academy Pro (enterprise plan — everything unlocked) |
| http://lvh.me:3000/es | Spanish locale (every route is `/en/…` or `/es/…`) |

Alternative for API clients: send an `x-tenant-slug: code-academy` header instead of using a subdomain.

---

## 7. Log in — seeded test accounts

All passwords are `password123`. Log in on the subdomain that matches the account's tenant, otherwise you'll be sent to `/join-school`.

| Email | Tenant | Role | Log in at |
|--|--|--|--|
| `student@e2etest.com` | Default School | student | http://lvh.me:3000 |
| `owner@e2etest.com` | Default School | admin **+ super admin** | http://lvh.me:3000 |
| `creator@codeacademy.com` | Code Academy Pro | admin | http://code-academy.lvh.me:3000 |
| `alice@student.com` | Code Academy Pro | student | http://code-academy.lvh.me:3000 |

`owner@e2etest.com` also has a `super_admins` row, so it can reach the platform panel at `/platform/*` (super-admin routing is independent of tenant role).

Email confirmation is **disabled** locally (`enable_confirmations = false`), so a fresh signup at `/auth/sign-up` logs straight in. Any mail the app does send lands in Mailpit at http://127.0.0.1:54324.

> These passwords are local-dev only, seeded by `db:reset`. Never use them anywhere deployed.

---

## 8. What the seed actually gives you

`supabase/seed.sql` (~69 KB) is reset-safe — every insert uses `ON CONFLICT DO NOTHING / DO UPDATE`, so re-running it never duplicates rows.

**Platform plans** — all five (`free`, `starter`, `pro`, `business`, `enterprise`) with their real feature flags and limits. The seed *overwrites* what the billing migration inserted, so it is the source of truth locally.

**Tenants** — deliberately two, on opposite ends of the plan range so you can exercise both sides of feature gating without changing any data:

| Slug | Name | ID | Plan |
|--|--|--|--|
| `default` | Default School | `00000000-0000-0000-0000-000000000001` | `free` — gates locked, upgrade nudges visible |
| `code-academy` | Code Academy Pro | `00000000-0000-0000-0000-000000000002` | `enterprise` — every feature unlocked |

**Courses**

| ID | Tenant | Title | Status |
|--|--|--|--|
| 1001 | default | Introduction to Testing | published |
| 1002 | default | Web Development Basics | published |
| 2001 | code-academy | Python for Beginners | published |
| 2002 | code-academy | Data Analysis with Pandas | published |

Course **2001** is the fully-built one: a complete lesson set with AI tasks, 7 exercises, and a final exam. Use it whenever you need realistic content. Certificates auto-issue only for courses that have an active `certificate_templates` row — seeded for 2001 and 9999 only.

**Commerce**

| Products | Tenant | Price | Provider |
|--|--|--|--|
| 1001 Testing Fundamentals Package | default | $29 | stripe |
| 1002 Web Dev Starter | default | $0 | manual |
| 2001 Python Mastery Bundle | code-academy | $49 | stripe |
| 2002 Code Academy Pro Monthly | code-academy | $19 | stripe |

| Subscription plans | Tenant | Price | Duration |
|--|--|--|--|
| 2001 Code Academy Pro Monthly | code-academy | $19 | 30 days |
| 2002 Code Academy Pro Annual | code-academy | $190 | 365 days |

`alice@student.com` starts with an **active subscription** to plan 2001, and `student@e2etest.com` starts enrolled in Default School courses — so subscription-gated and progress UI both have data on first load.

Also seeded: course categories, gamification levels + achievements + a profile per student, tenant branding settings for Code Academy, and a platform subscription row.

### Why the seed inserts auth users by hand

`handle_new_user()` is an `on auth.users` trigger — **it does not fire on direct SQL inserts**. So the seed manually writes `auth.users`, `auth.identities`, `profiles`, `user_roles`, and `tenant_users` for each account. If you add a test user via SQL, you must do the same (use `NULL` for `phone`, `''` for nullable strings), or that user will have no profile and no role.

### Re-seeding

```bash
npm run db:reset     # nuke + migrations + seed  (the normal move)
```

To load *only* the seed onto an existing local DB:

```bash
docker exec -i supabase_db_lms-front psql -U postgres -d postgres < supabase/seed.sql
```

`supabase/seed-prod.sql` is a much smaller production bootstrap (plans + default tenant, no test users) — do not run it locally.

---

## 9. Everyday commands

```bash
# App
npm run dev            # dev server (open lvh.me:3000)
npm run build          # production build — also the real typecheck + lint gate
npm run start          # serve the production build
npm run lint           # ESLint
npm run typecheck      # tsc --noEmit

# Database
supabase start / stop / status
npm run db:reset               # local: migrations + seed  (destructive, local only)
supabase migration new <name>  # create supabase/migrations/<ts>_<name>.sql
npm run db:push                # apply pending migrations to the LINKED CLOUD project
npm run db:types               # regenerate lib/database.types.ts from the linked project

# Tests
npm run test:unit                  # vitest, tests/unit/**
npx vitest run -t "name"           # single unit test
npx playwright test                # E2E, tests/playwright/**  (needs the dev server up)
npx playwright test -g "name"      # single E2E test
npx playwright test --ui           # interactive runner
```

### Migration workflow

1. `supabase migration new add_my_thing` → edit the generated SQL.
2. `npm run db:reset` → verify it applies cleanly **from scratch** and the seed still loads.
3. `npm run db:types` → commit the regenerated `lib/database.types.ts` alongside the migration.
4. Cloud gets it via `npm run db:push` (or the deploy pipeline) — never edit cloud schema by hand.

Any new tenant-scoped table needs RLS enabled plus policies in the same migration. See [`docs/MIGRATIONS.md`](./MIGRATIONS.md).

---

## 10. Testing

### Unit (Vitest)

Pure logic — payments, plan limits, webhooks, splits. No database, no browser.

```bash
npm run test:unit
```

### E2E (Playwright)

`tests/playwright/` holds ~34 specs covering tenant isolation, auth security, payments, enrollment, gamification, community, i18n, and the platform panel.

Three rules, all of which cost people an afternoon when ignored:

1. **Start the dev server first.** The Playwright config has no `webServer` — it will not boot the app for you.
2. **Use `lvh.me`, never `localhost`** (`baseURL` already defaults to `http://lvh.me:3000`). On localhost every authenticated test bounces to `/join-school`.
3. **Run serially locally** — the config already sets `workers: 1` outside CI. Parallel workers trip the GoTrue sign-in rate limit and cascade into auth timeouts.

```bash
npm run db:reset            # tests assume seed state
npm run dev                 # terminal 1
npx playwright test         # terminal 2
npx playwright test --project=mobile     # Pixel 5 viewport
npx playwright test --project=human --headed   # 500ms slow-mo, for watching/debugging
```

First run needs browsers: `npx playwright install chromium`.

Test credentials live in `tests/playwright/utils/constants.ts` (note: the `teacher` key there maps to `owner@e2etest.com`, which actually resolves to **admin**).

---

## 11. Optional services

### Stripe webhooks

Two independent integrations — student→school payments (Connect) and school→platform billing:

```bash
stripe listen --forward-to lvh.me:3000/api/stripe/webhook           # → STRIPE_WEBHOOK_SECRET
stripe listen --forward-to lvh.me:3000/api/billing/webhook/stripe  # → STRIPE_PLATFORM_WEBHOOK_SECRET
```

Each `stripe listen` prints its own signing secret; they are different values, don't cross them.

### Cron endpoints

`/api/cron/*` (subscription expiry, plan-limit enforcement, daily digest, league rollover, webhook redelivery, and payment/activation reconciliation) are protected by `CRON_SECRET`. Trigger one manually:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://lvh.me:3000/api/cron/expire-subscriptions
```

### MCP server

`mcp-server/` is a separate app (mcp-use + Supabase OAuth) exposing LMS tools to AI agents.

```bash
cd mcp-server && cp .env.example .env && npm install
PORT=3001 npm run dev     # inspector at http://localhost:3001/inspector
```

It defaults to **port 3000 and will fight the Next dev server** — give it 3001 as above and set `MCP_SERVER_URL=http://localhost:3001` in the root `.env.local`. Read the `mcp-apps-builder` skill before changing anything in there. Details: [`docs/MCP_SETUP.md`](./MCP_SETUP.md).

### Cloud Supabase instead of local

Works, but you share state with the team and `db:reset` is not available to you.

```bash
supabase login
supabase link --project-ref <ref>
# .env.local: point NEXT_PUBLIC_SUPABASE_URL / keys at the cloud project (Dashboard → Settings → API)
npm run db:push     # apply local migrations to cloud
```

---

## 12. Troubleshooting

**Everything redirects me to `/join-school`.**
You're on `localhost`. Use `http://lvh.me:3000`. If you're already on `lvh.me`, the account has no `tenant_users` row for that subdomain's tenant — log in on the right subdomain (§7).

**Port 3000 already in use.**
Usually a stray `mcp-server` (it defaults to 3000). Kill it, or run Next elsewhere: `PORT=3005 npm run dev` — and note that `supabase/config.toml` sets `site_url = "http://localhost:3005"`, so auth-email redirect links target 3005. If you run on 3000 and need password-reset/magic links to work, change `site_url` to `http://lvh.me:3000` and `supabase stop && supabase start`.

**`supabase start` hangs or fails.** Docker Desktop isn't running, or containers are stale:
```bash
supabase stop --no-backup && docker ps -a | grep supabase   # remove leftovers, then supabase start
```

**I changed a role and the UI didn't notice.**
JWT claims are stale. Call `supabase.auth.refreshSession()` (always required after a tenant switch), or log out and back in. `getUserRole()` reads `tenant_users` first, so update that table — not `user_roles`:
```sql
INSERT INTO tenant_users (user_id, tenant_id, role)
VALUES ('<user-uuid>', '00000000-0000-0000-0000-000000000001', 'teacher')
ON CONFLICT (user_id, tenant_id) DO UPDATE SET role = 'teacher';
```

**A query returns nothing / errors on `tenant_id`.**
Some tables have no `tenant_id` and filtering by it errors the whole query: `profiles`, `gamification_levels`, `lesson_completions`, `exercise_completions`, and every exam child table (`exam_questions`, `exam_answers`, `exam_question_scores`, `exam_scores`). Full list of these traps: the "Known Pitfalls" section of [`CLAUDE.md`](../CLAUDE.md).

**Module not found / stale build.**
```bash
rm -rf node_modules .next && npm install
```

**Course shows 0% progress or "no certificate at 100%".**
Progress queries must filter by `user_id`; certificates only auto-issue when the course has an active `certificate_templates` row (seeded for 2001/9999 only).

More: [`docs/TROUBLESHOOTING.md`](./TROUBLESHOOTING.md)

---

## 13. Project layout

```
app/
  [locale]/            all routes — (public), auth/, dashboard/{student,teacher,admin}/, platform/, onboarding/
  actions/             server actions — admin/, teacher/, platform/, payment-requests.ts, join-school.ts
  api/                 stripe/, cron/, chat/, certificates/, mcp/, teacher/, exercises/
components/            ui/ (shadcn base-mira), lesson/, teacher/, student/, admin/, gamification/, aristotle/
lib/
  supabase/            server.ts · client.ts · admin.ts · proxy.ts · tenant.ts · get-user-role.ts
  plans/ payments/ ai/ puck/ certificates/ services/
packages/core/         @lms/core — logic shared with the Expo app
supabase/
  migrations/          168 files, applied in filename order
  seed.sql             local dev + E2E seed        seed-prod.sql = production bootstrap
  config.toml          local stack config (ports, auth, JWT hook)
mcp-server/            standalone MCP server (own package.json)
tests/                 unit/ (vitest) · playwright/ (E2E) · demos/
messages/              en.json · es.json (next-intl)
proxy.ts               THE middleware — tenant + auth + role routing. Do not add middleware.ts.
```

---

## 14. Where to go next

| Read this | For |
|--|--|
| [`CLAUDE.md`](../CLAUDE.md) | Architecture reference + the known-pitfalls list. Read it before your first PR. |
| [`docs/DATABASE_SCHEMA.md`](./DATABASE_SCHEMA.md) | 65+ tables and their relationships |
| [`docs/AUTH.md`](./AUTH.md) | Auth flows, JWT hook, role resolution |
| [`docs/MONETIZATION.md`](./MONETIZATION.md) | School billing, student payments, feature gating |
| [`docs/DEVELOPMENT_WORKFLOW.md`](./DEVELOPMENT_WORKFLOW.md) | Branching, PRs, review expectations |
| [`docs/MIGRATIONS.md`](./MIGRATIONS.md) | Writing migrations and RLS policies |
| [`docs/I18N_GUIDE.md`](./I18N_GUIDE.md) | Adding translatable copy (en/es) |

**Before every PR:** `npm run build` passes · every tenant-scoped query filters `tenant_id` · tested as each affected role · loading + error states handled. Branch naming: `<type>/<slug>-<issueNumber>`, e.g. `fix/binance-settings-category-479`.
