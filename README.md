# LMS Platform

A multi-tenant SaaS Learning Management System. Schools run on subdomains (`school.platform.com`). Educators create and sell courses; students enroll and learn.

**Stack:** Next.js 16 · React 19 · TypeScript · Supabase · Shadcn UI · Tailwind CSS v4 · Stripe Connect · next-intl (en/es)

## Prerequisites

- Node.js 20+
- Docker (required for local Supabase)
- [Supabase CLI](https://supabase.com/docs/guides/cli)
- Stripe CLI _(optional — only for testing webhooks locally)_

## Quick Start

1. **Clone and install**
   ```bash
   git clone <repo-url>
   cd lms-front
   npm install
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env.local
   ```
   For local Supabase, set these four. Run `supabase status` (after step 3) and copy its **Publishable** and **Secret** keys — they are local-only dev keys, the same on every machine:
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY=<Publishable key from `supabase status`>
   SUPABASE_SERVICE_ROLE_KEY=<Secret key from `supabase status`>
   NEXT_PUBLIC_PLATFORM_DOMAIN=lvh.me:3000
   ```

3. **Start local Supabase** _(requires Docker)_
   ```bash
   supabase start
   npm run db:reset   # applies all migrations + seeds tenants, users, courses, products
   ```

4. **Run the dev server**
   ```bash
   npm run dev
   ```

5. **Open the app at `http://lvh.me:3000` — not `localhost`**

   Tenant resolution reads the subdomain; `lvh.me` resolves `*.lvh.me` to `127.0.0.1`. On `localhost` no tenant resolves and authenticated pages bounce to `/join-school`.

   - `http://lvh.me:3000` — Default School (free plan)
   - `http://code-academy.lvh.me:3000` — Code Academy Pro (enterprise plan)

6. **Log in** with a seeded account (all passwords `password123`), on the subdomain matching its tenant:

   | Email | Tenant | Role |
   |--|--|--|
   | `student@e2etest.com` | Default School (`lvh.me:3000`) | student |
   | `owner@e2etest.com` | Default School (`lvh.me:3000`) | admin + super admin |
   | `creator@codeacademy.com` | Code Academy (`code-academy.lvh.me:3000`) | admin |
   | `alice@student.com` | Code Academy (`code-academy.lvh.me:3000`) | student |

   Local-dev credentials only — seeded by `npm run db:reset`.

**Full walkthrough — seed contents, migrations, tests, optional services, troubleshooting: [`docs/GETTING_STARTED.md`](docs/GETTING_STARTED.md).**

## npm Scripts

| Script | Command |
|--------|---------|
| `npm run dev` | Start dev server |
| `npm run build` | Production build (TypeScript + lint) |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test:unit` | Vitest unit tests |
| `npm test` | Playwright E2E tests (dev server must already be running) |
| `npm run db:reset` | Reset local DB (migrations + seed) |
| `npm run db:push` | Push migrations to cloud Supabase |
| `npm run db:types` | Regenerate `lib/database.types.ts` |
| `npm run mcp:build` | Build the MCP server sub-project |

## Documentation

- [`docs/GETTING_STARTED.md`](docs/GETTING_STARTED.md) — **full local setup guide: env, seed data, migrations, tests, troubleshooting**
- [`CLAUDE.md`](CLAUDE.md) — architecture reference for AI agents and developers
- [`docs/DATABASE_SCHEMA.md`](docs/DATABASE_SCHEMA.md) — complete DB schema
- [`docs/AUTH.md`](docs/AUTH.md) — authentication flows
- [`docs/MONETIZATION.md`](docs/MONETIZATION.md) — billing and payments
