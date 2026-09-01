# Cron runbook

Operational guide for the `/api/cron/*` jobs: who schedules them, how to tell
they ran, and what to do when one fails. Written for issue #620 (epic #619).

`docs/DEPLOYMENT.md` §3.5 describes the three schedulers you *could* use. This
file records which one is actually in charge and how to operate it.

---

## 1. Scheduler of record: GitHub Actions

**`.github/workflows/cron.yml` is the single scheduler.** Nothing else invokes
these routes.

- `vercel.json` still lists the same schedules. **It is inert** — production runs
  on Dokploy, which never reads that file. It is kept only so a Vercel deploy of
  this repo works out of the box. Changing a schedule means changing *both*, and
  the workflow's `case` block is the one that takes effect.
- Dokploy scheduled tasks: **none defined.** Verified via the Dokploy API on
  2026-08-29 — `schedule.list` for the LMS application returned an empty list.
- pg_cron runs `league-weekly-rollover` (Mondays 00:05) *inside* the database.
  The `league-rollover` route is a deliberate second path to the same idempotent
  RPC, not a duplicate to remove.
- pg_cron is also **primary for `enforce-plan-limits`** (#660): job
  `enforce-plan-limits-daily` at `0 3 * * *` calls
  `public.invoke_cron_route('enforce-plan-limits')`, which reaches the route
  over HTTP with pg_net using `cron_secret` + `cron_base_url` from Supabase
  Vault. GitHub's `0 3` slot for that route is the fallback — GitHub has never
  been observed firing a daily schedule for this repo. Every invocation lands
  in `public.cron_runs`; `record-cron-run-results` (every 5 min) fills in the
  HTTP status/body, and `/platform/billing-health` shows the last sweep.

  ```sql
  -- once per environment (values never leave Vault)
  select vault.create_secret('<CRON_SECRET>',          'cron_secret');
  select vault.create_secret('https://preciopana.com', 'cron_base_url');
  -- is it alive?
  select route, requested_at, status_code, response, error
    from public.cron_runs order by requested_at desc limit 5;
  -- run it now
  select public.invoke_cron_route('enforce-plan-limits');
  ```

  With the Vault secrets missing the job records a `cron_runs` row with
  `error` set and does nothing else, so an unconfigured environment is loud on
  the billing-health page rather than silently idle.

Running two schedulers means every route fires twice. The routes tolerate it,
but it doubles load and makes logs unreadable. **If you move to Dokploy
schedules, delete the `schedule:` block here in the same change.**

### Required configuration

| Where | Kind | Name | Value |
|---|---|---|---|
| GitHub → Settings → Secrets and variables → Actions | Secret | `CRON_SECRET` | Must equal the app's `CRON_SECRET` |
| same | Variable | `CRON_BASE_URL` | `https://preciopana.com` |
| same | Variable | `NEXT_PUBLIC_SENTRY_DSN` | Already set; also used by the build |
| Dokploy → guille → LMS → Environment | env | `CRON_SECRET` | Same value as the GitHub secret |

A missing `CRON_BASE_URL` or `CRON_SECRET` fails the run with an `::error::`
rather than silently no-opping. A missing DSN only drops monitoring, with a
warning — the jobs still run.

The workflow must also be **enabled**. It shipped `disabled_manually` and
therefore never ran once, which is the whole reason #620 exists. Check with:

```bash
gh workflow list --all | grep 'Scheduled cron routes'   # want: active
gh workflow enable cron.yml
```

---

## 2. The jobs

| Route | Cadence | If it does not run |
|---|---|---|
| `solana-reconcile` | `*/10` | Student paid on chain, closed the tab: money taken, no entitlement, and the `pending` row blocks a retry checkout |
| `binance-personal-reconcile` | `*/10` | Same failure for personal Binance Pay (#482) |
| `redeliver-webhook-events` | `*/10` | An event whose worker died mid-lease is never processed by anyone — paid, never enrolled (#625) |
| `reconcile-solana-platform-activations` | `*/10` | School paid the platform on chain, activation crashed, plan never applied (#622) |
| `daily-digest` | hourly | No digests, no streak nudges. Must be **hourly** — each tenant sends at its own local hour |
| `expire-stale-checkouts` | hourly | An abandoned PayPal/Lemon Squeezy/Binance redirect leaves a `pending` transaction inside both purchase-uniqueness indexes, and the buyer can never retry that item again (#624). Reconciles PayPal orders before expiring, so an approved-but-uncaptured payment is taken rather than thrown away |
| `expire-subscriptions` | `0 0` | Lapsed self-managed subscriptions (Solana, manual) keep their entitlements forever |
| `league-rollover` | Mon `0 1` | Nothing — pg_cron is primary. This is the fallback |
| `expire-platform-subscriptions` | `0 2` | No renewal reminders, no grace period, no downgrade to free: a school that stopped paying keeps its paid plan |
| `enforce-plan-limits` | `0 3` | pg_cron is primary (#660); this is the fallback. If neither runs: a tenant that grows past its plan limits with no plan-change event is never cut off, a pending cutoff never completes, and no reminder email is ever sent |
| `solana-pull` | **never** | See §5 |

Every route is idempotent, so a late or repeated run is safe. `league-rollover`
in particular resolves the previous week from the data and finalizes every
unfinalized week, so running it late *is* the catch-up path (#549).

---

## 3. Monitoring

Each route reports to its own **Sentry cron monitor**, slug `cron-<route>`
(e.g. `cron-expire-platform-subscriptions`), in project `lms-front`,
environment `production`.

<https://guillermoscript.sentry.io/crons/>

Three signals, and they catch different things:

| Signal | Raised by | Means |
|---|---|---|
| Job failure | GitHub Actions (the job exits non-zero) | A route answered non-200. A deliberately unconfigured rail (`solana-reconcile`, `solana-pull` without Solana env) answers **200 `{ skipped }`**, not 503 (#660) — absence is not failure |
| Check-in `error` | Sentry | Same event, visible next to the run history |
| **Missed check-in** | Sentry | The run never happened at all |

The third is the one that matters. A workflow disabled by hand, a `*/10` tick
GitHub dropped, or the 60-day inactivity shutdown produces **no failure of any
kind** — no job, no log, no email. Only the absent check-in shows it.

The monitors are created and kept in sync by the workflow itself: each check-in
upserts the schedule that actually invoked it, so a monitor's schedule in Sentry
can never drift from `cron.yml`.

**Check-in margins** are 30 minutes for the `*/10` group and 120 minutes for the
daily jobs, because GitHub delays scheduled runs under load and drops
high-frequency ones first. Tighter margins produce noise, not information. If
the `*/10` monitors alert repeatedly while the workflow is healthy, that is
GitHub dropping ticks — the fix is to move to a Dokploy schedule (§1), not to
widen the margin further.

Manual `workflow_dispatch` runs deliberately do **not** check in: there is no
schedule to measure them against, and a manual run must never paper over a
missed scheduled one.

---

## 4. Procedures

### Verify end to end

```bash
gh workflow run cron.yml -f route=enforce-plan-limits
gh run watch
```

Expect HTTP 200 and a JSON body of counters. Then confirm the check-in landed —
note that a dispatch run does not check in, so verify monitoring on the first
*scheduled* tick instead, in the Sentry Crons view.

Direct call, bypassing Actions:

```bash
curl -sS -f -H "Authorization: Bearer $CRON_SECRET" \
  https://preciopana.com/api/cron/enforce-plan-limits
```

401 means the secret does not match the app's. The routes **fail closed**: if
`CRON_SECRET` is unset on the app, *every* request is rejected (plan 001), so a
401 never means "auth is off".

### One route failed, the others succeeded

The loop runs every route in the group regardless, then exits 1 if any failed.
The successful ones are done — do not re-run the whole group. Replay just the
failed one:

```bash
gh workflow run cron.yml -f route=solana-reconcile
```

### Rotate `CRON_SECRET`

There is one secret and no overlap window, so ordering matters:

1. Generate: `openssl rand -hex 32`
2. Set it in **Dokploy** first (guille → LMS → Environment), save, redeploy.
3. From the redeploy until step 4, every scheduled run fails 401 — loudly, which
   is intended. Do this outside the `0 0`–`0 3` block if you can.
4. `gh secret set CRON_SECRET`
5. `gh workflow run cron.yml -f route=enforce-plan-limits` and confirm 200.

### The workflow stopped running

GitHub disables scheduled workflows after 60 days with no repository activity,
and does it silently. `gh workflow list --all` shows `disabled_inactivity`.
Re-enable with `gh workflow enable cron.yml`, then run one route manually to
confirm, and check Sentry for how many ticks were missed.

---

## 5. `solana-pull` is manual-only, on purpose

`/api/cron/solana-pull` submits **real on-chain USDC transfers** — it pulls funds
from subscribers' wallets for native `solana_subs` auto-pull subscriptions. It
has never had a scheduler in `vercel.json` either, and `cron.yml` exposes it only
under `workflow_dispatch`.

**Consequence:** native Solana auto-pull subscriptions do not renew on their own.

This is safe today and verifiably so: as of 2026-08-29 production has **zero
rows in `subscriptions`** (19 tenants, all on the `free` plan), so there is
nothing to pull.

**Trigger to revisit:** the first `subscriptions` row with
`payment_provider = 'solana_subs'`. At that point either schedule this route or
disable that provider — leaving it as-is silently stops collecting money that is
owed. Guard it with:

```sql
select count(*) from subscriptions where payment_provider = 'solana_subs';
```

Before scheduling it, confirm `SOLANA_RPC_URL`, `SOLANA_PLATFORM_WALLET` and
`SOLANA_PULLER_SECRET_KEY` are set on the app and that the puller keypair holds
SOL for fees.

---

## 6. What a healthy first run looks like

Production carries no money yet — no subscriptions, no transactions, no webhook
events — so **every counter comes back zero**. That is a pass, not a no-op: it
proves auth, reachability, scheduling and monitoring, which is exactly what #620
asks for. Re-run this evidence once the first school is actually paying.
