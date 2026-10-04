# Provider Switch Review Repairs

## Context

PR #627 introduces a durable ledger for switching a tenant's platform subscription between payment providers. Review found correctness gaps around same-rail crypto renewals, expired replacement intents, manual-payment lifecycle cleanup, cancellation idempotency, and cron ordering.

The repair must preserve the core invariant: the current paid entitlement remains active until a validated replacement payment is promoted atomically. Delayed events for a superseded provider must never mutate the current entitlement.

## Scope

Address review findings 1–9. Partially address finding 10 by removing dead duplicated activation construction and correcting stale ownership comments. A full migration of every activation and downgrade path into database RPCs is outside this PR because it would broaden the concurrency model beyond issue #621.

## Identity and Activation Rules

The dispatcher will classify activation events into three explicit cases:

1. **Switch activation:** metadata carries a switch ID. Promotion uses the switch RPC and must match tenant, target provider, target plan, interval, and the locked source snapshot.
2. **Same-rail self-managed renewal:** the provider is the current provider and its capabilities declare a self-managed period. A signed or independently verified activation may rotate the synthetic external subscription ID and extend the period. Cross-provider events cannot use this exception.
3. **First or terminal-state activation:** there is no stored external identity, or the stored row belongs to the same provider and is in a terminal state. A different provider requires a switch ID even when the current row is inactive.

All other nonterminal events must match the current provider and external subscription identity exactly. Terminal events retain the existing exact-match downgrade rule; superseded terminal events may only close cleanup ledger state.

## Switch State Lifecycle

`cancellation_scheduled` records that the source provider accepted period-end cancellation. It is a closed cleanup outcome for concurrency purposes, so it will no longer participate in the one-open-switch-per-tenant unique index. Its eventual terminal webhook can still set `completed_at`.

Validated payment activation may revive an `abandoned` switch only when the source snapshot still exactly matches the current subscription. This covers provider-webhook, on-chain verification, and confirmed manual-payment races after an expiry sweep. It does not permit revival after a newer switch has promoted because the source snapshot will no longer match.

Hosted checkout abandonment will use a shorter durable timeout. Provider session expiry may shorten the pending window, but late validated payment remains recoverable through the guarded promotion rule. Manual and Solana requests retain their request-specific expiry.

Rejecting or expiring a payment request will transition its linked pending switch to `failed` or `abandoned`, releasing the unique slot immediately. Terminal or already-promoted switches are untouched.

## Cancellation Idempotency

Generic error-message regex classification will be removed. Each provider adapter will classify its own structured response:

- Stripe treats only its structured missing-resource code/status as already canceled.
- Lemon Squeezy treats only an HTTP 404 response as already canceled; authentication, store, and validation failures remain retryable failures.
- PayPal treats only an HTTP 404 response as already canceled.

Adapters return a successful immediate cancellation result for the already-absent case. The coordinator treats every thrown error as retryable and records it in the ledger.

## Cron Behavior

Critical subscription phases—payment-request expiry, reminders, grace handling, and downgrades—will run before external provider cancellation calls. Switch cleanup will process a small bounded batch after those phases. This prevents a slow or degraded provider from starving entitlement and notification work.

Expired payment requests and their linked switches will be reconciled together. Switch cleanup counters remain in the cron response for observability.

## Maintainability

Manual activation values will be constructed only inside the non-switch branch where they are used. Comments in downgrade helpers will describe the split ownership accurately: legacy expiry uses the TypeScript transition, while webhook exact-match downgrade uses the atomic RPC.

The SQL RPC remains the canonical atomic writer for switch promotion. Non-switch activation behavior is unchanged.

## Error Handling and Recovery

- A late validated payment promotes if and only if the original source snapshot is still current.
- A late payment whose source no longer matches fails safely and remains visible for manual reconciliation; it cannot overwrite a newer entitlement.
- Provider cancellation failure never rolls back a paid target. It records a retry with bounded exponential backoff.
- Rejection and expiry release only pending switches linked to that request.
- Stale or uncorrelated cross-provider events are audited by the webhook ledger and otherwise ignored.

## Verification

Add or extend regression coverage for:

- Binance and Solana same-rail renewal identity rotation and period extension.
- Cross-provider stale activation while the current row is past due.
- A scheduled Lemon Squeezy cancellation not blocking a later switch.
- Revival of an abandoned switch after a validated hosted, Solana, or manual payment.
- Refusal to revive after the source snapshot changes.
- Manual rejection and cron expiry releasing the linked pending switch.
- Provider-specific already-canceled classification, including Lemon Squeezy 422 remaining retryable and Stripe missing-resource convergence.
- Critical cron phases running independently of a bounded cleanup batch.
- Existing exact terminal identity, duplicate activation, cancellation retry, RLS, and atomic RPC behavior.

Run the targeted billing suites, the full unit suite, `npm run typecheck`, changed-file lint, a fresh `npm run db:reset`, migration/RPC SQL checks, and `npm run build`.

