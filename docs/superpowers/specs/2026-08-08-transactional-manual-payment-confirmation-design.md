# Transactional Manual Platform-Payment Confirmation

Issue: [#623](https://github.com/guillermoscript/lms-front/issues/623)

## Context

`confirmManualPayment` currently reads a platform payment request, marks it
confirmed, and then performs separate writes for the platform subscription,
tenant billing mirror, revenue split, and provider-switch ledger. Those writes
do not share one transaction and several errors are ignored. Concurrent calls
can therefore extend a renewal twice, race a rejection, or leave money recorded
without matching service.

Recent work on #621 and #625 established two relevant contracts:

- provider switches retain the source subscription until replacement activation
  and use exact-identity, row-locked promotion;
- self-managed platform periods use a tenant advisory lock and business-effect
  idempotency.

Issue #621 temporarily retained an older behavior that revived an expired manual
switch request. Issue #623 supersedes that behavior for ordinary manual
confirmation: expired and rejected requests are terminal. A future late-funds
recovery flow must be explicit and separately audited instead of bypassing the
normal request state machine.

## State and Idempotency Contract

The confirmation RPC accepts a request only from `pending`,
`instructions_sent`, or `payment_received`.

- `confirmed`: return idempotent success with `applied = false`. Preserve the
  original confirmer, timestamp, period, and entitlement. Never extend again.
- `rejected` or `expired`: fail without changing any row.
- missing request, missing plan, unauthorized actor, tenant/switch mismatch, or
  stale source-subscription identity: fail and roll back.

The request row remains the durable audit record. Existing amount, currency,
bank reference, provider/proof reference, and request metadata remain unchanged;
the successful transaction stamps `confirmed_by` and `confirmed_at` once.

## Database Design

Add a service-role-only `public.confirm_platform_payment_request` PostgreSQL
function. It uses `SECURITY INVOKER`, an empty `search_path`, fully qualified
objects, and verifies that the supplied actor exists in `public.super_admins`.
Execution is revoked from `PUBLIC`, `anon`, and `authenticated` and granted only
to `service_role`.

The function executes this lock order:

1. Lock the payment request with `FOR UPDATE` and validate/replay its state.
2. Acquire the same tenant advisory transaction lock used by self-managed
   platform-period application.
3. Lock the current `platform_subscriptions` row when it exists.
4. For a provider switch, call the existing promotion function, which locks the
   switch ledger after the subscription lock.

For a non-switch request, the function atomically:

- calculates the new billing period;
- upserts the tenant's platform subscription and clears cancellation, grace,
  reminder, and plan-override state;
- updates `tenants.plan`, `billing_status`, and `billing_period_end`;
- upserts the plan's current transaction-fee split;
- marks the payment request confirmed with the original actor and timestamp.

For a switch request, promotion and request confirmation occur in the same RPC
transaction. Any failed identity/status check raises an error and rolls back the
request plus every entitlement/accounting write.

## Billing-Period Calculation

Create one restricted PostgreSQL billing-period helper and use it from both the
new manual-confirmation RPC and `apply_self_managed_platform_period`.

- Renewals begin at the later of the stored period end and the transaction's
  current timestamp.
- Upgrades, downgrades, and provider replacements begin at the current timestamp.
- Monthly and yearly arithmetic uses PostgreSQL `timestamptz` plus calendar
  intervals, avoiding application-local timezone arithmetic.

Tests pin month-end and leap-year behavior so later refactors cannot silently
change the UTC/calendar contract.

## Server Action and Post-Commit Work

The Server Action retains authentication, the existing super-admin preflight,
and the user-friendly downgrade-limit check. It delegates all money-to-service
database mutation to the new RPC and handles RPC errors explicitly.

`reconcileAccessCutoff` and source-provider cancellation stay outside the
database transaction because they can send email or call external providers.
They run only after a successful/idempotent RPC result. The provider-switch
ledger remains the durable retry boundary for cancellation failures.

The action removes its unused session client and refreshes the platform billing
route after success.

## Failure Handling

Any database exception aborts the RPC transaction, leaving the request and all
subscription, tenant, split, and switch rows unchanged. Client-visible errors
distinguish terminal request state, missing/mismatched data, unauthorized actor,
and generic transaction failure without exposing sensitive row contents.

The downgrade-limit preflight remains application-side and therefore is not a
transactional usage lock. Expanding that invariant would require coordinating
course and tenant-membership writers and is outside #623.

## Verification

- Add a real-PostgreSQL transactional SQL test that injects failures at request,
  subscription, tenant, revenue-split, and switch boundaries and verifies full
  rollback after each failure.
- Run two concurrent confirmations and assert one application, one idempotent
  replay, one period extension, and stable audit fields.
- Cover all allowed source states plus rejected, expired, confirmed replay,
  unauthorized actor, missing request/plan, and switch mismatch.
- Cover monthly month-end and yearly leap-day arithmetic.
- Update unit tests so the Server Action delegates once to the RPC, surfaces RPC
  errors, preserves post-commit reconciliation, and no longer revives expired
  manual requests.
- Run `npm run db:reset`, focused SQL/Playwright tests, `npm run test:unit`,
  `npm run typecheck`, and `npm run build`.

No user-visible UI changes are required, so visual evidence is not applicable.
