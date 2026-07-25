# Contributing

Thanks for considering a contribution. This is a real, running product, so the bar is "it works for every tenant and every role" — but the setup is a single `npm install` + `supabase start` away, and small fixes are very welcome.

## Ways to help

- **Good first issues** — [`good first issue`](https://github.com/guillermoscript/lms-front/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) and [`help wanted`](https://github.com/guillermoscript/lms-front/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22)
- **Bugs** — open an issue with the tenant, role, and steps to reproduce
- **Translations** — `messages/en.json` and `messages/es.json`; new locales welcome
- **Docs** — anything in `docs/` that was wrong or missing when you set up
- **Payment providers** — the provider contract lives in `lib/payments/` (see `docs/PROVIDER_AGNOSTIC_PAYMENTS_SPIKE.md`)

## Setup

Full walkthrough: [`docs/GETTING_STARTED.md`](docs/GETTING_STARTED.md). The short version:

```bash
npm install
cp .env.example .env.local        # fill in the four local Supabase vars
supabase start && npm run db:reset
npm run dev                        # open http://lvh.me:3000 — NOT localhost
```

Seeded logins (all `password123`, local dev only) are listed in the [README](README.md#quick-start).

## Workflow

1. Branch from `master`: `<type>/<slug>-<issueNumber>` — e.g. `fix/payout-rounding-516`
2. Commit with [Conventional Commits](https://www.conventionalcommits.org/): `fix(payments): ...`, `feat(admin): ...`, `docs: ...`
3. Open a PR against `master`, filling in the template (what changed, why, how to QA)
4. CI runs typecheck + unit tests on every PR; lint is surfaced but non-blocking (there is a large pre-existing baseline — just keep the files *you* touch clean)

Before pushing:

```bash
npm run typecheck
npm run test:unit
npm run build          # catches what typecheck alone misses
npx playwright test    # if you touched auth, tenancy, or payments
```

## What reviewers look for

This is a **multi-tenant** app with **RLS as the security boundary**. Most review comments come from these five:

- **Every tenant-scoped query filters by `tenant_id`** — even though RLS also enforces it. Exceptions: `profiles`, `gamification_levels`, `lesson_completions`, and the exam child tables, which have no `tenant_id` column at all.
- **Reads go straight from components via RLS.** Server actions are for multi-step mutations, service-role work, and external APIs (Stripe, email) — not for ordinary reads.
- **`createAdminClient()` bypasses RLS.** If you use it, validate tenant ownership by hand before any write.
- **Tested with every relevant role** — student, teacher, admin — and on both seeded tenants.
- **Loading and error states handled**, and any new UI string added to both `en.json` and `es.json`.

Architecture, schema invariants, and the list of known pitfalls live in [`CLAUDE.md`](CLAUDE.md) — it is written for AI agents but it is the fastest orientation for humans too. Schema details: [`docs/DATABASE_SCHEMA.md`](docs/DATABASE_SCHEMA.md).

## Database changes

```bash
supabase migration new <name>   # never edit an applied migration
npm run db:reset                # verify it applies from scratch, with the seed
npm run db:types                # regenerate lib/database.types.ts, commit the diff
```

New tenant-scoped table? It needs `tenant_id`, RLS enabled, and policies — a table without policies is invisible to the app and a table without `tenant_id` leaks across schools.

## Security

Do not open a public issue for a vulnerability. See [SECURITY.md](SECURITY.md).

## Questions

Open a [Discussion](https://github.com/guillermoscript/lms-front/discussions) or comment on the issue you want to pick up.
