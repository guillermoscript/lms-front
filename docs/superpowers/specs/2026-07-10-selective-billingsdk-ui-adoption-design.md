# Selective BillingSDK UI Adoption

## Goal

Adopt BillingSDK UI components only where they make LMS billing clearer, more accessible, responsive, and easier to maintain. This is a presentation-layer migration, not a payment-system rewrite.

## Decisions

- Retain Stripe, Stripe Connect, Supabase, RLS, provider factory, webhooks, entitlement RPCs, transaction records, and invoice generation.
- Retain provider-specific workflows: Stripe Checkout and Portal redirects, manual bank-transfer approval, Lemon Squeezy redirect, Solana QR and Phantom signing, and subscription lifecycle handling.
- Introduce BillingSDK source through local LMS adapter components. App routes use local adapters, never upstream components directly.
- Pin the imported BillingSDK version and keep its source/configuration in the repository. Upstream changes are reviewed and selectively merged, never automatically adopted.
- Do not import any BillingSDK source until its license and version are verified compatible with this repository. The referenced BillingSDK documentation currently states GPL terms; incompatible source means recreate the approved UI using local Shadcn primitives instead.

## Adoption Rule

Replace an existing surface only if all conditions hold:

1. BillingSDK component covers the interaction without weakening provider-aware behavior or tenant isolation.
2. It materially improves design quality, accessibility, responsiveness, or maintenance over current component.
3. An adapter can supply current typed LMS data and invoke existing actions/routes without provider credentials in browser code.
4. Localization, loading, error, empty, disabled, and mobile states remain complete.
5. License compatibility has been approved.

## Surface Inventory And Recommendation

| Surface | Current owner | Recommendation | Reason |
|---|---|---|---|
| Public course/plan pricing | app/[locale]/(public)/pricing/pricing-client.tsx | Evaluate BillingSDK pricing table | Commodity pricing comparison; existing UI duplicates toggle/card logic. Preserve checkout links and localized plan data. |
| Platform pricing | app/[locale]/(public)/platform-pricing/pricing-display.tsx | Evaluate BillingSDK pricing table | Strong candidate if it supports five plans, feature comparison, yearly toggle, and action slots. Keep plan URLs and public copy. |
| Admin plan upgrade | components/admin/plan-comparison-table.tsx | First adoption target | Direct fit for pricing/plan selection. Adapter must keep Stripe checkout and manual-transfer handlers separate. |
| Admin billing overview | components/admin/billing-overview.tsx | Evaluate subscription management + usage meter | Current plan, renewal/cancellation, portal, past-due, and capacity data map naturally. Keep existing warning rules/actions. |
| Usage | components/admin/usage-meter.tsx | Evaluate usage meter | Reusable, isolated visual primitive. Preserve unlimited, 80% warning, 100% limit states. |
| Admin invoices | app/[locale]/dashboard/admin/invoices/page.tsx | Evaluate invoice history | UI-only table/list possible. Existing invoice route remains authority for downloads. |
| Student billing/payments | app/[locale]/dashboard/student/billing/page.tsx | Evaluate invoice history and payment-history views | Adopt only history/presentation portions. Preserve manual proof uploads and transaction behavior. |
| Public checkout | components/public/checkout-form.tsx | Keep flow; selectively refine primitives only | Provider branching, QR polling, Phantom signing, manual/offline flow are LMS-specific. Do not replace checkout orchestration. |
| Platform payment-request review | app/[locale]/platform/billing/page.tsx | Keep local | Operational workflow and approval state are LMS-specific. |

## Component Boundary

Create local adapter components in components/billing/:

- PricingTableAdapter: maps LMS plan records to view props and owns yearly state/action routing.
- SubscriptionManagementAdapter: maps billing status, renewal/cancellation state, portal action, and plan-change link.
- UsageMeterAdapter: maps normalized usage, unlimited limit, warning, and blocked states.
- InvoiceHistoryAdapter: maps LMS invoice/transaction rows to view props and download links.

Adapters receive typed view models and callbacks. Server routes/pages remain responsible for Supabase reads. Client adapters invoke existing server actions/API routes only through supplied callbacks. No component may instantiate a payment SDK or access provider secret values.

## Data Flow

Server page/action -> current Supabase query/RPC -> typed LMS view model -> local adapter -> BillingSDK component or local Shadcn fallback -> existing checkout, portal, cancellation, invoice, or manual-transfer action.

No table schema, RLS policy, environment variable, webhook endpoint, or provider capability changes are in scope.

## Delivery Sequence

1. License/version decision and component capability audit.
2. Add or recreate isolated usage-meter adapter; use it in admin billing and admin dashboard.
3. Add plan-comparison/pricing adapter; ship first on admin upgrade, then evaluate public pricing surfaces.
4. Add subscription-management adapter for admin billing overview.
5. Add invoice-history adapter for admin/student history only if it improves existing view.
6. Polish checkout primitives only where a component is a clear improvement; preserve orchestration.
7. Remove superseded local components only after all consumers move and visual/behavior checks pass.

## Validation

- npm run build passes.
- Verify desktop and mobile states for free, paid, past-due, cancelling, expiring manual transfer, unlimited, warning, at-limit, empty invoices, and invoice-download error.
- Verify en/es copy and date/currency formatting.
- Verify Stripe checkout, Billing Portal, manual-transfer, Lemon Squeezy, Solana QR, and Phantom paths still reach existing endpoints unchanged.
- Check keyboard navigation, visible focus, semantic controls, color contrast, and reduced-motion behavior.
- Compare pre/post screenshot and interaction behavior for each adopted surface.

## Non-Goals

- Replacing payment providers or provider-agnostic contracts.
- Changing Stripe/Supabase schema, webhooks, RLS, entitlements, or payment processing.
- Forcing an upstream component onto a surface where the local UI is better.
