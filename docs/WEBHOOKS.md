# Outbound webhooks

Schools (and the platform) can subscribe a URL (n8n, Zapier, Make, custom server) to LMS events. Each event is a signed JSON `POST`, retried on failure.

- School owners: **Dashboard → Settings → Webhooks** (`/dashboard/admin/settings/webhooks`). Admin role only. Receives that school's events.
- Platform super-admins: **Platform → Webhooks** (`/platform/webhooks`). Receives **every** school's events plus the platform-only `school.*` events.

## How it works

```
source table write ──AFTER trigger──▶ emit_outbound_webhook() ──▶ outbound_webhook_deliveries (pending)
                                                                         │
                          cron /api/cron/deliver-webhooks (every minute) ┘
                          claim (SKIP LOCKED + 5 min lease) → signed POST → success | backoff | failed
```

- Events are captured by **DB triggers** (`supabase/migrations/20261016140000_outbound_webhooks.sql`), so every write path emits: client RLS inserts, RPCs, server actions, provider webhooks. Emitters swallow their own errors: a webhook problem can never fail the source write.
- Both tables are **service-role only** (the endpoints table holds signing secrets). Pages and actions use the admin client and filter by tenant manually: `app/actions/webhooks.ts` resolves the scope server-side (the client only says `school` or `platform`), and every query goes through `scopeFilter`.
- Limits: 10 endpoints per school, 20 platform-wide (enforced by trigger). Delivery logs are pruned after 30 days.

## Events

| Event | Fired when | Scope |
|---|---|---|
| `enrollment.created` | row inserted in `enrollments` | school |
| `lesson.completed` | row inserted in `lesson_completions` | school |
| `exam.submitted` | row inserted in `exam_submissions` | school |
| `exam.graded` | `exam_submissions.score` set/changed | school |
| `payment.succeeded` | transaction becomes `successful` | school |
| `subscription.created` | row inserted in `subscriptions` | school |
| `subscription.status_changed` | `subscription_status` changes | school |
| `member.joined` | row inserted in `tenant_users` | school |
| `certificate.issued` | row inserted in `certificates` | school |
| `entitlement.granted` | row inserted in `entitlements` with status `active` | school |
| `entitlement.revoked` | entitlement status becomes `revoked` | school |
| `payment.failed` | transaction becomes `failed` | school |
| `payment.refunded` | `transactions.refunded_amount` changes or status becomes `refunded` (`amount` = this refund, `full_refund` flag) | school |
| `payment_request.created` | manual/offline payment request created | school |
| `payment_request.status_changed` | manual payment request status changes | school |
| `course.completed` | student completes the last published lesson of a course (may repeat if a lesson is un-completed and redone) | school |
| `exam.passed` / `exam.failed` | exam score set, or its pass/fail outcome flips (pass mark = active certificate template's minimum, default 70) | school |
| `community.post.created` | visible non-milestone post created (no body in payload) | school |
| `community.comment.created` | visible community comment created (high volume, no body in payload) | school |
| `community.content_reported` | row inserted in `community_flags` (post or comment report) | school |
| `invitation.created` / `invitation.accepted` | row inserted in / accepted `tenant_invitations` | school |
| `member.status_changed` | `tenant_users.status` changes (includes `ban_reason` when banned) | school |
| `member.role_changed` | `tenant_users.role` changes | school |
| `course.published` / `lesson.published` | status becomes `published` (includes scheduled lesson publish) | school |
| `certificate.revoked` | `certificates.revoked_at` set | school |
| `payout.created` / `payout.status_changed` | row inserted in / status changes on `payouts` | school |
| `billing.status_changed` | the school's billing status changes (`past_due` = payment problem) | school |
| `school.access_cutoff` | access-cutoff notice sent (`stage`: scheduled, reminder_7d, reminder_1d, enforced) | school |
| `school.created` | row inserted in `tenants` | platform only |
| `school.plan_changed` | `tenants.plan` changes | platform only |
| `school.billing_status_changed` | `tenants.billing_status` changes | platform only |
| `platform_payment.requested` / `platform_payment.status_changed` | school's platform billing payment request created / status changes | platform only |
| `platform_fee.statement_created` | platform fee statement issued | platform only |
| `platform_subscription.changed` | platform subscription created, or status/plan/interval/cancel-at-period-end changes | platform only |
| `webhook.test` | "Send test" button | either |

`lesson.completed` and `community.comment.created` are high volume: subscribe to specific events rather than `*` if your receiver is rate limited. Events live in `20261016140000_outbound_webhooks.sql` and `20261016160000_outbound_webhooks_more_events.sql`.

Add an event: add the trigger/emit call in a migration, add the string to `lib/webhooks/events.ts` (a unit test checks every catalog entry appears in an `*outbound_webhooks*.sql` migration).

## Payload

```json
{
  "id": "6f1c…",                // event id, also the X-Webhook-Id header (use it to de-duplicate)
  "type": "enrollment.created",
  "created_at": "2026-10-16T22:01:00.123Z",
  "tenant_id": "0000…0001",
  "data": {
    "enrollment_id": 42, "course_id": 1001, "status": "active",
    "user": { "id": "…", "full_name": "Ada", "email": "ada@example.com" }
  }
}
```

Delivery is **at least once**: a retry after a timeout can repeat an event. De-duplicate on `id`.

## Headers

| Header | Meaning |
|---|---|
| `X-Webhook-Id` | event id (stable across retries) |
| `X-Webhook-Delivery` | delivery row id |
| `X-Webhook-Event` | event type |
| `X-Webhook-Timestamp` | unix seconds the attempt was signed |
| `X-Webhook-Signature` | `v1=` + hex HMAC-SHA256 of `"{timestamp}.{raw body}"` with your secret |

Reject requests whose timestamp is more than 5 minutes old (replay protection). Secrets look like `whsec_…`, are shown **once** on create/rotate, and are never readable again.

### Verify in an n8n Code node (or any Node receiver)

In the Webhook node enable **Raw Body** (Options), then add a Code node (Run Once for All Items):

```js
const crypto = require('crypto');
const secret = 'whsec_…';
const h = $input.first().json.headers;
const ts = h['x-webhook-timestamp'];
const sig = h['x-webhook-signature'];
const raw = (await this.helpers.getBinaryDataBuffer(0, 'data')).toString('utf8');
const expected = 'v1=' + crypto.createHmac('sha256', secret).update(`${ts}.${raw}`).digest('hex');
if (Math.abs(Date.now() / 1000 - Number(ts)) > 300 ||
    expected.length !== sig.length ||
    !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) {
  throw new Error('invalid signature');
}
return $input.all();
```

(The signing/verify logic is covered by `tests/unit/webhooks.test.ts`; the n8n node wiring above has not been run against a live n8n: adjust the raw-body access if your n8n version differs. Enabling the `crypto` builtin may need `NODE_FUNCTION_ALLOW_BUILTIN=crypto` on self-hosted n8n.)

Verification is optional for a quick start but recommended: the URL alone is the only other thing protecting your workflow.

## Retries and failure handling

- 2xx = delivered. Anything else (non-2xx, timeout after 10 s, network error, 3xx redirect: redirects are **never followed**) = failed attempt.
- Attempt schedule after a failure: 1 min, 5 min, 30 min, 2 h, 6 h, 12 h, 24 h (8 attempts, about 2 days). After that the delivery is `failed`; use **Retry** in the log to requeue it.
- After 10 exhausted deliveries in a row an endpoint is **paused automatically** (`disabled_reason = too_many_failures`). Fix the receiver and switch it back on.

## Security

- Target URLs must be public `https://`. Loopback, private ranges, link-local (cloud metadata), `.internal`/`.local` and single-label hosts are rejected on save **and again at send time** (DNS re-resolved). Plain `http://localhost` is allowed only outside production, for local n8n.
- Known residual: DNS rebinding between the guard's lookup and the request's own lookup. Mitigations in place: redirects off, no response bodies stored.
- Payloads include member emails: the school owner already has them; the platform endpoint sees them across schools, so only super-admins can create one.

## Ops

- Cron: `/api/cron/deliver-webhooks` every minute (`vercel.json`), `CRON_SECRET` bearer. On a self-hosted crontab call it the same way as the other cron routes (see `docs/CRON_RUNBOOK.md`).
- Rollback: `supabase/migrations/rollback/20261016140000_outbound_webhooks.down.sql` and `20261016160000_outbound_webhooks_more_events.down.sql`.
- Code: `lib/webhooks/` (events, signing, url-guard, input, deliver, endpoints), `app/actions/webhooks.ts`, `components/webhooks/webhooks-manager.tsx`.
