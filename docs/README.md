# Documentation

Index of the `docs/` folder. Every link here points at a file that exists — if you find a dead link or a stale claim, fix it in the same PR.

## Start here

| Doc | What it covers |
|--|--|
| [GETTING_STARTED.md](./GETTING_STARTED.md) | **Run the project**: install, `.env.local`, Supabase, seed data, dev server, tests, troubleshooting |
| [../CLAUDE.md](../CLAUDE.md) | Condensed architecture reference + the known-pitfalls list. The single most useful page for a new contributor |
| [PROJECT_OVERVIEW.md](./PROJECT_OVERVIEW.md) | High-level goals and architecture |
| [DEVELOPMENT_WORKFLOW.md](./DEVELOPMENT_WORKFLOW.md) | Day-to-day practices, branching, PRs |

## Technical reference

| Doc | What it covers |
|--|--|
| [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) | Tables, columns, enums, RPCs, RLS patterns — plus how to verify it against the live DB |
| [MIGRATIONS.md](./MIGRATIONS.md) | Writing and applying migrations |
| [AUTH.md](./AUTH.md) | Auth flows, JWT hook, role resolution |
| [API_REFERENCE.md](./API_REFERENCE.md) | API routes and their purposes |
| [ENV_VARIABLES.md](./ENV_VARIABLES.md) | Environment variables in detail |
| [I18N_GUIDE.md](./I18N_GUIDE.md) | Adding translatable copy (en/es) |
| [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) | Common issues and fixes |

## Features

| Doc | What it covers |
|--|--|
| [MONETIZATION.md](./MONETIZATION.md) | School billing, feature gating, LATAM payments, revenue dashboard |
| [PROVIDER_AGNOSTIC_PAYMENTS_SPIKE.md](./PROVIDER_AGNOSTIC_PAYMENTS_SPIKE.md) | The payment-provider contract (Stripe, PayPal, Lemon Squeezy, Solana, Binance) |
| [MANUAL_PAYMENT_SYSTEM.md](./MANUAL_PAYMENT_SYSTEM.md) | Offline / bank-transfer payment flow |
| [GAMIFICATION.md](./GAMIFICATION.md) | XP, levels, streaks, achievements, store, leagues |
| [COMMUNITY_SPACES.md](./COMMUNITY_SPACES.md) | Community feed, comments, reactions, polls, moderation |
| [LANDING_PAGE_BUILDER.md](./LANDING_PAGE_BUILDER.md) · [AI_LANDING_PAGE_GENERATION.md](./AI_LANDING_PAGE_GENERATION.md) | Puck visual editor and the AI page generator |
| [AI_INTEGRATION.md](./AI_INTEGRATION.md) | AI tutor, grading, and exercise evaluation |
| [GUIDED_TOURS.md](./GUIDED_TOURS.md) | Onboarding tours (driver.js) |
| [MDX_COMPONENTS.md](./MDX_COMPONENTS.md) | Lesson content blocks |
| [PLATFORM_ADMIN.md](./PLATFORM_ADMIN.md) · [PLATFORM_SETTINGS_GUIDE.md](./PLATFORM_SETTINGS_GUIDE.md) | Super-admin panel |
| [MCP_SETUP.md](./MCP_SETUP.md) | MCP server for AI agents |

## Operations

| Doc | What it covers |
|--|--|
| [OPERATIONS_GUIDE.md](./OPERATIONS_GUIDE.md) | Running the platform |
| [DEPLOYMENT.md](./DEPLOYMENT.md) · [DOCKER_DEPLOYMENT.md](./DOCKER_DEPLOYMENT.md) | Deploying |
| [CLOUDFLARE_WILDCARD_SETUP.md](./CLOUDFLARE_WILDCARD_SETUP.md) | Wildcard DNS for tenant subdomains |

## For AI agents

| Doc | What it covers |
|--|--|
| [AI_AGENT_GUIDE.md](./AI_AGENT_GUIDE.md) | Patterns and conventions for AI assistants |
| [COMMON_TASKS.md](./COMMON_TASKS.md) | Frequent development tasks, step by step |

## Need to…

- **Run the project for the first time?** → [GETTING_STARTED.md](./GETTING_STARTED.md)
- **Add a table or migration?** → [DATABASE_SCHEMA.md § Adding New Tables](./DATABASE_SCHEMA.md#adding-new-tables) and [MIGRATIONS.md](./MIGRATIONS.md)
- **Check a column name?** → Grep `lib/database.types.ts` (generated, always correct), then [DATABASE_SCHEMA.md § Verifying this document](./DATABASE_SCHEMA.md#verifying-this-document)
- **Debug auth or roles?** → [AUTH.md](./AUTH.md), then the pitfalls list in [../CLAUDE.md](../CLAUDE.md)
- **Add a payment provider?** → [PROVIDER_AGNOSTIC_PAYMENTS_SPIKE.md](./PROVIDER_AGNOSTIC_PAYMENTS_SPIKE.md)

## A note on the rest of this folder

`docs/` also contains dated implementation summaries, test reports, audits and phase write-ups (`PHASE_*`, `*_SUMMARY.md`, `*_REPORT.md`, `FEBRUARY_2026_*`, `ENTITLEMENTS_MIGRATION_PLAN.md`, `ACTUAL_SCHEMA.md`, …). Those are **historical records of a moment in time**, not maintained references — several describe schema that has since changed. Use them for context on *why* something was done; never as the current source of truth. `docs/adr/` holds architecture decision records, `docs/plans/` and `docs/refactor-plans/` hold planning documents.
