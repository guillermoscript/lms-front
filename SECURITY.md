# Security Policy

## Reporting a vulnerability

**Please do not open a public issue.** Report privately via
[GitHub Security Advisories](https://github.com/guillermoscript/lms-front/security/advisories/new),
or email **arepayquezo@gmail.com** with `[security]` in the subject.

Include: what you found, how to reproduce it, and the impact you think it has. A proof of concept
against your own local instance is ideal.

Expect an acknowledgement within a few days. Please give a reasonable window for a fix before
disclosing publicly.

## In scope

This is a multi-tenant platform, so anything that crosses a boundary is high priority:

- **Cross-tenant data access** — reading or writing another school's data
- **Privilege escalation** — student → teacher/admin, tenant admin → super admin
- **RLS bypass** — reaching rows a policy should have blocked
- **Payment integrity** — gaining course access without a successful transaction or valid entitlement, tampering with revenue splits or payouts
- **Auth flaws** — session fixation, JWT claim forgery, broken password reset
- **Exposure of secrets** — service-role keys or provider credentials leaking to the browser bundle

## Out of scope

- The seeded local-dev accounts and their `password123` passwords (`supabase/seed.sql`) — local only, never deployed
- The hardcoded Sentry DSN in `sentry.server.config.ts` — public by design
- `NEXT_PUBLIC_*` values being visible in the client bundle — that is what the prefix means
- Findings that require a self-hosted operator to misconfigure their own instance
- Automated scanner output with no demonstrated impact, missing security headers with no exploit path, DoS by volume

## Self-hosting notes

If you run your own instance: keep `SUPABASE_SERVICE_ROLE_KEY` server-side only, never put a
production OpenAI key in `NEXT_PUBLIC_OPENAI_API_KEY` (it ships to the browser), reseed nothing
from `supabase/seed.sql` in production, and verify RLS is enabled on every table you add.
