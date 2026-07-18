# Course-first admin checklist design

## Goal

Make the admin dashboard's Getting Started checklist reflect the shortest honest path from a new school to a published, sellable course. A school using manual payments and the free platform plan must be able to reach full completion, and completed steps must remain useful navigation links.

## Current behavior

The checklist puts school configuration, branding, Stripe, and course creation in that order. Course creation links to the teacher content form and completes for any course, including drafts. Payment completion requires a Stripe account, the upgrade row requires a paid platform plan, and completed rows are rendered as dead `#` links by the shared checklist component.

## Considered approaches

1. **Five counted setup steps and no upgrade row — selected.** This keeps the denominator honest and avoids duplicating the Plan & Usage controls directly below the checklist.
2. **Five counted steps plus an optional Grow row.** This preserves an upgrade prompt but requires extending the shared checklist model with counted/optional semantics and adds visual complexity without helping setup completion.
3. **Keep six steps and mark free/manual states complete automatically.** This weakens the meaning of completion and leaves an upsell inside setup progress.

## Design

### Checklist order and destinations

The admin checklist contains exactly five counted steps:

1. Create and publish the first course, linking to `/dashboard/admin/products/new`.
2. Set up how the school gets paid, linking to `/dashboard/admin/settings?tab=payment`.
3. Brand the school, linking to `/dashboard/admin/appearance`.
4. Invite students, linking to `/dashboard/admin/users`.
5. Configure school details, linking to `/dashboard/admin/settings`.

The platform-plan upgrade row is removed. The existing Plan & Usage bar remains the dedicated upgrade surface.

### Completion rules

- Course creation completes only when the tenant has at least one published course. Existing `publishedCourses` data provides this signal without a new query.
- Payment setup completes when Stripe is connected or the Payments form has been deliberately saved. Saving that form always persists the `manual_payment_instructions` setting, including an empty string, so row presence is an existing no-schema marker that the admin deliberately reviewed payment setup. This lets manual-only schools complete the step without implying that default-on Stripe is configured.
- Branding, invitation, and school-details rules retain their current data sources.
- All five rules remain tenant-scoped.

### Shared checklist interaction

`OnboardingChecklist` always renders each step's actual `href`, including completed steps. Completed rows keep their checked and muted presentation but receive normal hover/navigation affordance. This fixes admin, teacher, and student checklists consistently because the dead-link behavior lives in the shared component.

### Copy and localization

English and Spanish admin onboarding copy is updated together. The first label explicitly connects course creation with pricing and publishing, and its description mentions both the one-screen quick-create flow and the AI draft generator. Payment copy is provider-neutral and states that manual payments are valid. Invitation copy specifically mentions students. Removed billing keys may remain temporarily if deleting them would create unrelated translation churn, but they are no longer consumed by this checklist.

## Error handling and data boundaries

No new mutation, schema, server action, or client-side data fetch is introduced. Existing server-rendered dashboard queries remain the source of truth. Missing settings rows mean payment setup is incomplete; failed/empty query data continues to fall back to incomplete states rather than falsely completing a step.

## Risks

- The shared completed-link change affects all role dashboards. Their step destinations are already valid, so this is expected and will be verified.
- AI-generated draft courses intentionally do not complete the publish step.
- A newly created school already has `site_name`, so the final school-details step may begin checked. That reflects persisted state and does not block the course-first ordering.
- Payment form row presence is a pragmatic completion marker. A dedicated `payment_setup_completed` setting would be more explicit but would expand schema and mutation scope without changing user-visible behavior.

## Verification

- Add focused automated coverage for five-step order, quick-create/payment destinations, removed billing row, published-course completion, manual-payment completion, and live completed links.
- Verify English and Spanish copy.
- Run targeted tests, `npm run lint` on changed files where practical, `npm run typecheck`, and `npm run build`.
- In the running app, capture before/after dashboard screenshots and record the changed checklist flow, including navigation from a completed item.

