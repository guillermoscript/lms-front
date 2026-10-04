# Status

What actually works today, and what is blocked. Updated 2026-09-12.

This is the one page in `docs/` that is allowed to go stale by design — everything else
should describe the system as built. When a loop's state changes, change it here.

## The four MVP loops

Tracked by [EPIC #682](https://github.com/guillermoscript/lms-front/issues/682). Each loop
has an E2E spec that runs on every pull request (`e2e` job, 4 shards, `.github/workflows/ci.yml`).

| Loop | What it proves | State | Spec |
|--|--|--|--|
| **1 · Creator publishes** | Sign up → create school → create course → add lesson → publish | ✅ green in CI | `tests/playwright/loop-1-creator-publishes.spec.ts` |
| **2 · Student learns** | Public link → sign-up → lesson → exam → certificate PDF → `/verify` | ✅ green in CI | `tests/playwright/loop-2-student-learns.spec.ts` |
| **3 · Student pays school** | Stripe test-mode checkout → entitlement granted → revenue + payouts pages | ✅ green in CI | `tests/playwright/loop-3-student-pays.spec.ts` |
| **4 · School pays platform** | Plan upgrade, platform billing, plan limits | 🟡 specs green, **prod blocked** | `tests/playwright/plan-change.spec.ts`, `platform-billing-stripe-webhook.spec.ts`, `plan-limit-surfaces.spec.ts` |

Loop 3 has one known flake: `loop-3-student-pays.spec.ts:622` (logged-in dashboard course
heading) goes green on retry. Not a regression signal.

## Blocked on credentials, not on work

These shipped their code. They cannot be finished in production until someone supplies keys.

| Item | Shipped | Missing |
|--|--|--|
| **Loop 4 prod upgrade** | Checkout, webhooks, plan limits, feature gates | Live Stripe price ids in `platform_plan_prices` — live keys not ready |
| **Transactional email** ([#676](https://github.com/guillermoscript/lms-front/issues/676)) | The UI reports Mailgun state honestly instead of pretending | Mailgun keys in prod. Prod currently sends nothing |
| **Alternative-rail QA** ([#479](https://github.com/guillermoscript/lms-front/issues/479)) | PayPal, Lemon Squeezy, Binance and Solana rails | Sandbox credentials for each. #479 no longer gates anything |

## Environments

| | Where | Notes |
|--|--|--|
| Local | `default.lvh.me:3000`, `code-academy.lvh.me:3000` | `supabase start` + `npm run db:reset`. Never `localhost` — the tenant proxy needs a subdomain |
| CI | GitHub Actions, `ci.yml` | Own Supabase stack per shard, seeded from `supabase/seed.sql` |
| Production | Dokploy, image from `ghcr.io` | Build-time `NEXT_PUBLIC_*` live in `.github/workflows/deploy.yml` **build-args**, not in Dokploy |

## Where to look next

- Current architecture and the invariants that bite: [`../CLAUDE.md`](../CLAUDE.md)
- Schema: [`DATABASE_SCHEMA.md`](./DATABASE_SCHEMA.md)
- Money: [`MONETIZATION.md`](./MONETIZATION.md), [`PROVIDER_AGNOSTIC_PAYMENTS_SPIKE.md`](./PROVIDER_AGNOSTIC_PAYMENTS_SPIKE.md)
- Tests: [`../tests/README.md`](../tests/README.md)
- Screenshot evidence per issue: [`qa/README.md`](./qa/README.md)
- Historical write-ups: [`archive/`](./archive/README.md)
