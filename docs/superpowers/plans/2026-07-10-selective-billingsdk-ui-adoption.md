# Implementation Plan: Selective BillingSDK UI Adoption

## Guardrails

- UI only. Do not change provider contracts, Stripe Connect, Supabase schema/RLS, webhooks, entitlement logic, checkout endpoints, or invoice generation.
- Keep server data loading in route/server components. Make only stateful BillingSDK wrappers client components.
- Use `next-intl` strings for all new visible copy.
- Reuse existing actions/endpoints through callbacks. No BillingSDK component receives provider keys or creates provider SDK clients.
- Stop before adding upstream code if the exact BillingSDK component/version license is not compatible.

## 1. Dependency and compatibility audit

1. Read BillingSDK registry/component docs for exact source, peer dependencies, shadcn registry format, accessibility support, supported props, and license.
2. Record selected version and source URL in package metadata or a short local README next to imported components.
3. Compare each candidate with existing `components/ui` primitives and current surfaces. Reject upstream source if it creates more custom maintenance than the local component.
4. If upstream license is incompatible, implement the accepted visual/interaction contract locally with existing Shadcn components. Do not copy GPL source.
5. Install only required dependencies. Verify lockfile diff contains no unrelated upgrades.

## 2. Add stable LMS billing view models

Create `components/billing/types.ts` with serializable view types:

- `BillingPlanView`: id, slug, localized name/description, monthly/yearly price, currency, limits, feature rows, current/recommended state, checkout URL/action availability.
- `UsageView`: label, current, limit, status (`normal`, `warning`, `blocked`, `unlimited`).
- `SubscriptionView`: plan, status, period, cancel-at-period-end, grace period, payment method, portal/manage availability.
- `InvoiceView`: id/number, date, amount, currency, status, download URL.

Add small mapper functions beside adapters. Existing Supabase rows stay inside route/action layer; adapters receive only view models and callbacks.

## 3. Usage meter pilot

Files:

- Add `components/billing/usage-meter-adapter.tsx`.
- Update `components/admin/billing-overview.tsx`.
- Update `app/[locale]/dashboard/admin/page.tsx` if its use matches adapter contract.

Requirements:

- Preserve `-1` unlimited behavior, 80% warning, and at-limit destructive state.
- Render semantic progress state and text equivalent, not color alone.
- Preserve current layout with no nested-card regression.
- Use adapter locally first; replace legacy `components/admin/usage-meter.tsx` only after all consumers migrate.

## 4. Plan comparison and pricing table

Files:

- Add `components/billing/pricing-table-adapter.tsx`.
- Update `components/admin/plan-comparison-table.tsx` or replace its internal view using adapter.
- Update `app/[locale]/dashboard/admin/billing/upgrade/upgrade-page-client.tsx`.
- Evaluate then optionally update `app/[locale]/(public)/platform-pricing/pricing-display.tsx` and `app/[locale]/(public)/pricing/pricing-client.tsx`.

Requirements:

- Retain monthly/yearly selection, five-tier support, current-plan state, recommended plan, price display, feature comparisons, capacity limits, and transaction fee.
- Keep separate callback routes for Stripe subscription checkout and manual transfer. Do not reduce them to a generic payment action.
- Public pages retain provider-aware checkout links. Admin upgrade retains authenticated actions and error/toast handling.
- Use responsive plan cards plus a feature-comparison pattern only if it remains usable on narrow screens.

## 5. Subscription management adapter

Files:

- Add `components/billing/subscription-management-adapter.tsx`.
- Update `components/admin/billing-overview.tsx`.
- Update `app/[locale]/dashboard/admin/billing/billing-dashboard-client.tsx`.

Requirements:

- Show plan, billing cadence, period dates, renewal/cancellation, past-due status, manual-transfer expiry, and grace period.
- Preserve Stripe Billing Portal action and existing change-plan path.
- Important/danger states use explicit text, appropriate `aria-live` feedback after actions, and no color-only signal.
- Do not expose cancellation in generic UI until current authorization and action behavior are passed unchanged.

## 6. Invoice history adapter

Files:

- Add `components/billing/invoice-history-adapter.tsx`.
- Evaluate `app/[locale]/dashboard/admin/invoices/page.tsx`.
- Evaluate `app/[locale]/dashboard/student/billing/page.tsx`.

Requirements:

- Preserve server-side authorization and current invoice download route.
- Support empty, failed download, pending/manual, paid, refunded/failed states represented by current data.
- On mobile, turn low-priority columns into a readable summary without hiding status, total, or download control.

## 7. Checkout boundary

Do not replace `components/public/checkout-form.tsx` orchestration. It owns provider branching, manual flow, Lemon Squeezy redirect, Solana QR polling, and Phantom signing.

Only adopt a BillingSDK visual primitive if it can be used as a leaf component with unchanged callbacks and state. Verify all of:

- Stripe card path
- manual payment request
- Lemon Squeezy hosted redirect
- Solana QR
- Solana subscriptions/Phantom
- free enrollment

## 8. Tests and review

1. Extend relevant Playwright specs: `tests/playwright/payment-flows.spec.ts`, `tests/playwright/school-owner-flow.spec.ts`, `tests/playwright/admin-pages.spec.ts`, and `tests/playwright/ui-states.spec.ts`.
2. Add focused component/unit tests for view mappers and usage state boundaries.
3. Run `npm run test:unit`, targeted Playwright billing tests, then `npm run build`.
4. Manually test en/es, mobile/desktop, keyboard focus, screen-reader labels, reduced motion, and loading/error/empty states.
5. Capture before/after screenshots. Accept each replacement only if it improves clarity and retains all current behavior.

## Completion Criteria

- Every adopted surface meets the adoption rule in design spec.
- Existing checkout/provider flows reach same endpoints and produce same transaction/entitlement results.
- No provider key or privileged billing logic reaches client bundle.
- License/version decision documented.
- No unrelated payment code changed.
- Build and targeted tests pass.
