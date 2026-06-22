# Admin Product/Course Creation Design

## Context

The current LMS separates course creation and product creation:

- Teachers create course shells at `/dashboard/teacher/courses/new`.
- Admins create purchasable products at `/dashboard/admin/products/new`.
- Admin product creation requires choosing an already published course.

The target experience is closer to Guaybo's guided product creation: an admin can start from a single flow, choose whether to create a new course or use an existing one, configure pricing, add post-registration instructions, then save or publish when required setup is complete.

Teacher course creation stays as-is for now. This design changes the admin product creation experience only.

## Goals

- Make admin product/course setup feel like one guided journey.
- Avoid duplicate course shells by asking whether the admin wants a new course or an existing course.
- Keep the first version focused: course/product basics, free vs paid pricing, course/product linking, post-registration instructions, and publish readiness.
- Preserve current database patterns: tenant-scoped rows, RLS-aware flows, admin access checks, and direct Supabase reads in server pages.
- Reuse existing payment provider integration where possible.

## Non-Goals

- No Guaybo-style sales page preview in v1.
- No FAQ, testimonials, advanced payment plans, affiliates, installments, or content upload in this first pass.
- No change to `/dashboard/teacher/courses/new`.
- No post-registration form builder or required/optional completion tracking in v1.

## User Stories

- As an admin, I can start creating an offering and choose between a new course or an existing course.
- As an admin, I can create a free course without creating a fake zero-price product.
- As an admin, I can create a paid product linked to a course from the same flow.
- As an admin, I can add post-registration instructions for paid products, such as WhatsApp, Telegram, Discord, a link, or text.
- As an admin, I can save a draft at any point.
- As an admin, I can publish only when required setup is complete.
- As a teacher, I can continue creating course content through the existing teacher flow without product/pricing fields.

## Proposed Journey

### Step 1: Course Source

The first step asks:

- Create new course
- Use existing course

For existing course mode, show searchable tenant courses. Existing courses can be draft or published, since the admin may be preparing a paid product around a draft course before publishing.

### Step 2: Basics

Fields:

- Course/product title
- Description
- Category
- Thumbnail URL

For a new course, these fields create the course shell.

For an existing course, prefill course fields and keep title, description, category, and thumbnail shared with the course in v1. The product name and description mirror the course fields when pricing is paid. Separate product copy is out of scope for this first version.

### Step 3: Pricing

The admin chooses:

- Free
- Paid

Free:

- Save or update the course.
- Do not create a product.
- Publish readiness checks only course requirements.

Paid:

- Require price, currency, and payment provider.
- Create or update a `products` row.
- Create or update one `product_courses` link between the product and course.
- Product starts as `inactive` until publish. The existing product status vocabulary is `active` and `inactive`; this design does not add a separate product draft status.

### Step 4: Post-Registration

Post-registration applies to paid offerings in v1 because steps are product-scoped.

Supported step types:

- WhatsApp
- Telegram
- Discord
- Link
- Text

Each step has:

- Type
- Title
- Optional description
- URL for URL-based step types
- Sort order
- Active flag

These steps are displayed as after-purchase instructions. They do not block access, track completion, or perform automation in v1.

### Step 5: Review and Publish

The final step shows a readiness checklist:

- Course source selected.
- Required basics present.
- Paid pricing valid when pricing is paid.
- Product linked to course when pricing is paid.
- Post-registration steps valid when present.

Actions:

- Save draft: available once a course title is present and, for existing course mode, a tenant-owned course is selected.
- Publish: enabled only when required readiness checks pass.

Publishing:

- Sets course `status = 'published'`.
- Sets product `status = 'active'` for paid offerings.

## Data Model

Use existing tables for the core flow:

- `courses`: course shell and publication state.
- `products`: paid offering details.
- `product_courses`: product-to-course link.

Add one tenant-scoped table:

```sql
create table product_post_registration_steps (
  id bigserial primary key,
  tenant_id uuid not null references tenants(id) on delete cascade,
  product_id integer not null references products(product_id) on delete cascade,
  type text not null check (type in ('whatsapp', 'telegram', 'discord', 'link', 'text')),
  title text not null,
  description text,
  url text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Indexes:

- `(tenant_id, product_id, sort_order)`
- `(product_id)`

RLS:

- Admins can manage tenant rows.
- Teachers do not need access in v1.
- Students do not read this table in v1. Student-facing display of post-registration steps requires a later post-purchase surface and matching read policy.

## UI Structure

Admin create/edit pages use a server page plus client wizard:

- `app/[locale]/dashboard/admin/products/new/page.tsx`
  - Fetch tenant, categories, and tenant courses.
  - Render wizard in create mode.

- `app/[locale]/dashboard/admin/products/[productId]/edit/page.tsx`
  - Fetch product, linked course, tenant courses, and post-registration steps.
  - Render wizard in edit mode.

- `components/admin/product-creation-wizard.tsx`
  - Owns step state, local validation, draft/publish action selection, and review checklist.

- `components/admin/product-post-registration-editor.tsx`
  - Owns add/edit/remove/reorder of post-registration steps.

- `app/actions/admin/products.ts`
  - Adds a single save action for wizard payloads.

Desktop layout:

- Left step rail.
- Main form panel.
- Review/checklist section on final step.

Mobile layout:

- Top progress indicator.
- Single-column form.
- Sticky action bar only if it does not obscure content.

## Server Action

Add:

```ts
saveProductCreationWizard(input: ProductCreationWizardInput): Promise<ActionResult<ProductCreationWizardResult>>
```

Responsibilities:

- Verify admin access.
- Resolve and validate current tenant.
- Validate input server-side.
- Check course limit when creating a new course.
- Create/update course shell.
- Verify existing course belongs to tenant when selected.
- If pricing is free, do not create a product.
- If editing a paid product into free, archive the product instead of deleting it.
- If pricing is paid, create/update product through existing payment provider abstraction.
- Ensure the `product_courses` link exists and belongs to the tenant.
- Replace product post-registration steps with the submitted active list.
- If `publish = true`, publish course and activate product if paid.
- Revalidate admin products, admin monetization, teacher course list, public courses, public products, and checkout-relevant paths.

## Validation and Error States

Client validation provides fast feedback, but server action is authoritative.

Expected errors:

- Not authenticated.
- Not admin.
- Course limit reached.
- Existing course missing or wrong tenant.
- Required basics missing.
- Paid offering missing price, currency, or payment provider.
- Payment provider failure.
- Invalid post-registration URL for WhatsApp, Telegram, Discord, or Link.
- Product/course link failure.

Errors should appear inline in the relevant step and as a top-level alert on save failure.

## Testing

Unit tests:

- Validate wizard payload mapping.
- Validate readiness checklist logic.
- Validate post-registration URL rules.

Server action tests, if current test harness supports mocked Supabase/payment provider:

- New free course saves without product.
- New paid offering creates course, product, product link, and post-registration steps.
- Existing course paid offering creates product and link.
- Editing paid to free archives product.
- Wrong-tenant course is rejected.

Playwright smoke tests:

- Admin creates new paid offering and publishes.
- Admin creates free course and publishes.
- Admin links existing course to paid product.

Manual checks:

- Mobile layout has no overlapping sticky controls.
- Keyboard navigation works through wizard steps.
- Publish button disabled until readiness checks pass.
- Teacher course creation remains unchanged.

## Open Implementation Notes

- The current docs generated by `npx @next/codemod agents-md --version 16.2.9 --output AGENTS.md` are available locally in `.next-docs`.
- `PRODUCT.md` and `DESIGN.md` are not present for the impeccable skill. Product-register rules were applied from the skill reference.
- Existing product form assumes paid products require price greater than zero. The wizard should preserve that for paid mode and avoid product creation for free mode.
