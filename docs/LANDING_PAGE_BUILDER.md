# Landing Page Builder

Visual drag-and-drop landing page builder powered by **Puck v0.20** (`@measured/puck`). School admins on the `starter` plan and above can create fully customizable landing pages using 32 pre-built components across 4 categories, with 8 starter templates.

---

## Architecture

### Database

**`landing_pages`** table stores all page data per tenant:

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `tenant_id` | UUID | Tenant ownership |
| `name` | VARCHAR | Page display name |
| `slug` | VARCHAR | URL slug (`home` for homepage) |
| `puck_data` | JSONB | Puck editor state (component tree, zones, root props) |
| `is_active` | BOOLEAN | Only one active page per tenant+slug (partial unique index) |
| `status` | VARCHAR | `draft` or `published` |

RLS policies: tenant members can read; tenant admins can manage; public can read active+published pages.

### Asset Storage

Image uploads go to the `landing-page-assets` Supabase Storage bucket. Upload handled by `app/actions/admin/landing-page-assets.ts`.

### Rendering Pipeline

1. **Editor** (`<Puck>`) — admin builds pages with drag-and-drop, saves `puck_data` JSONB to the database
2. **Renderer** (`<Render>`) — public pages render `puck_data` through `PuckPageRenderer`
3. Both use `createPuckConfig(t)` to get a translated Puck config instance

---

## Components (32 total)

### Primitives (9)

| Component | Description |
|-----------|-------------|
| `Heading` | Configurable heading (h1-h6) with alignment |
| `TextBlock` | Rich text / paragraph block |
| `Image` | Image with alt text, sizing, and alignment |
| `ButtonBlock` | CTA button with link, variant, and size options |
| `Video` | Embedded video (YouTube, Vimeo, etc.) |
| `Divider` | Horizontal rule / separator |
| `Spacer` | Vertical spacing block |
| `IconBlock` | Icon display from icon library |
| `BadgeBlock` | Styled badge / tag element |

### Layout (5)

| Component | Description |
|-----------|-------------|
| `Section` | Full-width container with background, padding — uses `DropZone` for nested content |
| `Columns` | Multi-column layout — uses `DropZone` per column |
| `Container` | Constrained-width wrapper — uses `DropZone` |
| `Grid` | CSS grid layout — uses `DropZone` for cells |
| `Card` | Styled card container — uses `DropZone` for inner content |

### LMS Blocks (14)

| Component | Description |
|-----------|-------------|
| `HeroBlock` | Main banner with title, subtitle, dual CTA, background image |
| `FeaturesGrid` | Feature cards in configurable grid columns |
| `CourseGrid` | Course cards (can auto-populate from DB) |
| `PricingTable` | Product/plan pricing cards |
| `TestimonialGrid` | Student testimonial / quote cards |
| `FaqAccordion` | Accordion-style FAQ section |
| `StatsCounter` | Metrics display (value + label pairs) |
| `CtaBlock` | Call-to-action banner with customizable style |
| `ContactForm` | Contact / inquiry form |
| `LogoCloud` | Partner / sponsor logo strip |
| `Banner` | Announcement / notification banner |
| `TeamGrid` | Instructor / team member showcase |
| `ImageGallery` | Image gallery with grid layout |
| `SocialProof` | Social proof indicators (reviews, ratings, etc.) |

### Navigation (4)

| Component | Description |
|-----------|-------------|
| `Header` | Page header with logo, nav links |
| `Footer` | Page footer with links, copyright |
| `Navbar` | Navigation bar variant |
| `BreadcrumbBlock` | Breadcrumb navigation trail |

---

## Templates (8)

Defined in `lib/puck/templates/index.ts`. Each template is a `PuckTemplate` object containing pre-built `puck_data`. When applied, `deepCloneWithFreshIds()` generates unique component IDs to avoid collisions.

| Template | Description |
|----------|-------------|
| **Blank** | Empty canvas with just a Header and Footer |
| **Modern Academy** | Full-featured school page (hero, features, courses, testimonials, CTA, FAQ) |
| **Minimal** | Clean, minimal layout focused on content |
| **Bold Creator** | Bold typography and layout for solo creators |
| **Course Catalog** | Focused on showcasing courses |
| **About** | About / team page layout |
| **Contact** | Contact page with form and info |
| **FAQ** | Dedicated FAQ page |

---

## File Structure

```
lib/puck/
  config.ts                         # Puck config: createPuckConfig(t) + static puckConfig
  components/
    primitives/                     # 9 primitive components
      heading.tsx, text.tsx, image.tsx, button-block.tsx,
      video.tsx, divider.tsx, spacer.tsx, icon-block.tsx, badge-block.tsx
    layout/                         # 5 layout components (use DropZone)
      section.tsx, columns.tsx, container.tsx, grid.tsx, card.tsx
    lms/                            # 14 LMS-specific blocks
      hero-block.tsx, features-grid.tsx, course-grid.tsx,
      pricing-table.tsx, testimonial-grid.tsx, faq-accordion.tsx,
      stats-counter.tsx, cta-block.tsx, contact-form.tsx,
      logo-cloud.tsx, banner.tsx, team-grid.tsx,
      image-gallery.tsx, social-proof.tsx
    navigation/                     # 4 navigation components
      header.tsx, footer.tsx, navbar.tsx, breadcrumb-block.tsx
  templates/
    index.ts                        # 8 built-in templates + deepCloneWithFreshIds()

components/admin/landing-page/
  puck-editor.tsx                   # 'use client' — wraps <Puck> editor
  template-picker.tsx               # Template selection dialog
  preview-banner.tsx                # Banner shown on preview pages

components/public/landing-page/
  puck-page-renderer.tsx            # 'use client' — wraps <Render> for public pages

app/actions/admin/
  landing-pages.ts                  # Server actions: CRUD, publish, activate, duplicate
  landing-page-assets.ts            # Asset upload to Supabase Storage

lib/landing-pages/
  types.ts                          # Minimal types for default school navbar/footer
                                    # (HeaderSettings, FooterSettings)

app/[locale]/dashboard/admin/landing-page/
  page.tsx                          # Admin landing page management
  preview/[pageId]/
    page.tsx                        # Full-page preview (uses createAdminClient)
```

---

## Routes

### Admin

| Route | Description |
|-------|-------------|
| `/dashboard/admin/landing-page` | Landing page list, create, manage |
| `/dashboard/admin/landing-page/preview/[pageId]` | Full-page preview with preview banner |

### Public

| Route | Description |
|-------|-------------|
| `/` | Homepage — renders the active landing page for the tenant |
| `/p/[slug]` | Additional pages by slug |

---

## i18n Support

The Puck config supports internationalization through `createPuckConfig(t)`:

- Component labels are translated via `t('components.ComponentName')`
- Category titles are translated via `t('categories.categoryName')`
- Field labels are translated via `translateFieldLabel()` which looks up `t('fieldLabels.Label')`
- Field option labels are also translated
- The static `puckConfig` export uses English defaults for non-i18n contexts

Both `PuckEditor` and `PuckPageRenderer` call `useTranslations('puck')` and pass the translator to `createPuckConfig(t)`.

---

## Admin UX

### List View

- Cards per page variant with status badges (`draft` / `published` / `active`)
- Create from template picker or blank canvas
- Actions: Activate, Deactivate, Duplicate, Delete
- Only one page can be active per slug at a time
- Cannot delete the active page

### Editor (Puck)

- Full Puck drag-and-drop editor with component sidebar
- Components organized into 4 categories (Primitives, Layout, LMS Blocks, Navigation)
- Top bar: page name, status badge, Save button, Publish button, Back navigation
- Uses `usePuck()` hook to access editor state for save operations
- Save writes `puck_data` JSONB to the database via `updateLandingPage()` server action
- Publish calls `publishLandingPage()` server action

### Preview

- Full-page preview at `/dashboard/admin/landing-page/preview/[pageId]`
- Shows a "Preview Mode" banner with page status and "Back to Editor" link
- Uses `createAdminClient()` so draft pages are previewable (bypasses RLS)
- Verifies `tenant_id` matches the admin's tenant for isolation

---

## Feature Gating

- `FEATURE_REQUIRED_PLAN.landing_pages = 'starter'` in `lib/plans/features.ts`
- Admin route wrapped with `<FeatureGate feature="landing_pages">`
- Free-plan schools see an upgrade prompt instead of the builder

---

## Public Rendering

The public homepage (`app/[locale]/(public)/page.tsx`) renders landing pages as follows:

1. Detect tenant from subdomain
2. If tenant plan is `starter` / `pro` / `business` / `enterprise`:
   - Query `landing_pages` for `is_active = true AND status = 'published'`
   - If found, render `<PuckPageRenderer data={puck_data} />`
3. Otherwise, fall back to the default `<SchoolLandingPage>` (product grid)
4. Default tenant (`00000000-0000-0000-0000-000000000001`) always shows the platform homepage

---

## Key Technical Notes

- **Layout components use `DropZone`** from `@measured/puck` to enable nested content. Since `DropZone` is not available in `@measured/puck/rsc`, any component using it must be a client component.
- **`PuckPageRenderer` must be `'use client'`** because `<Render>` internally uses `DropZone` which requires client-side React context.
- **`deepCloneWithFreshIds()`** generates unique random IDs when applying templates, preventing component ID collisions across pages.
- **Server actions use `puck_data`** (not the old `sections`/`settings` columns which were dropped).
- **`createAdminClient()`** is used for preview routes so admins can preview draft pages that RLS would otherwise block.
- **Asset uploads** go through `app/actions/admin/landing-page-assets.ts` to the `landing-page-assets` Supabase Storage bucket.

---

## Known Behaviors

- Deactivating a page does not unpublish it; it just stops being served publicly
- Duplicating creates a new draft copy with `(Copy)` appended to the name
- Templates are applied client-side with fresh IDs via `deepCloneWithFreshIds()`
- Slug validation rejects reserved slugs (`api`, `dashboard`, `admin`, `auth`, `login`, `signup`, `register`)
- Page name max length: 255 characters; slug max length: 100 characters
- Default slug for new pages is `home`
