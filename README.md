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
   # Fill in at minimum: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
   ```

3. **Start local Supabase** _(requires Docker)_
   ```bash
   supabase start
   supabase db reset   # applies all migrations + seeds test data
   ```

4. **Run the dev server**
   ```bash
   npm run dev
   ```

5. **Open the app**
   Visit `http://localhost:3000` — or use a tenant subdomain like `http://testschool.lvh.me:3000`

## npm Scripts

| Script | Command |
|--------|---------|
| `npm run dev` | Start dev server |
| `npm run build` | Production build (TypeScript + lint) |
| `npm run lint` | Run ESLint |
| `npm test` | Run Playwright E2E tests |
| `npm run db:reset` | Reset local DB (migrations + seed) |
| `npm run db:push` | Push migrations to cloud Supabase |
| `npm run mcp:build` | Build the MCP server sub-project |

## Documentation

- [`docs/GETTING_STARTED.md`](docs/GETTING_STARTED.md) — full local setup guide
- [`CLAUDE.md`](CLAUDE.md) — architecture reference for AI agents and developers
- [`docs/DATABASE_SCHEMA.md`](docs/DATABASE_SCHEMA.md) — complete DB schema
- [`docs/AUTH.md`](docs/AUTH.md) — authentication flows
- [`docs/MONETIZATION.md`](docs/MONETIZATION.md) — billing and payments
