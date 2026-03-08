# Landing Page Builder

Implemented a section-based landing page editor for school admins. Schools on the starter plan and above can replace the default hardcoded `SchoolLandingPage` with a fully customizable landing page composed of pre-defined section types.

---

## What Was Built

### Database

Two new tables:

**`landing_pages`**
- Stores landing page variants per tenant
- `sections JSONB` — ordered array of section objects
- `settings JSONB` — page-level meta (title, description, og image, custom css)
- `is_active BOOLEAN` — only one active page per tenant+slug (enforced by partial unique index)
- `status VARCHAR` — `draft` | `published`
- RLS: tenant members read, tenant admins manage, public reads active+published pages

**`landing_page_templates`**
- Global (no `tenant_id`) — seeded templates available to all schools
- Stores pre-built section arrays admins can start from
- Seeded with 5 templates: Modern Academy, Minimal, Bold Creator, Course Focus, Blank

Migration file: `supabase/migrations/20260221_create_landing_pages.sql`

---

### Section Types

Each section in the `sections` array has the shape:

```typescript
interface LandingSection {
  id: string        // nanoid
  type: SectionType
  visible: boolean  // toggle without deleting
  data: Record<string, unknown>
}
```

12 section types implemented:

| Type | Description |
|------|-------------|
| `hero` | Main banner — title, subtitle, dual CTA, background image, alignment |
| `features` | Feature cards grid — 2/3/4 columns, icon + title + description per item |
| `courses` | Auto-populated course grid or carousel from DB |
| `testimonials` | Student quote cards |
| `faq` | Accordion FAQ |
| `cta` | Call-to-action banner — gradient / solid / outline styles |
| `stats` | Metrics display (value + label pairs) |
| `text` | Rich text / markdown block |
| `image_text` | Image + text side by side, image left or right |
| `video` | Embedded video section |
| `pricing` | Auto-populated product pricing cards from DB |
| `team` | Instructor / team showcase |

---

### File Structure

```
lib/landing-pages/
  types.ts              # All TypeScript interfaces
  section-defaults.ts   # Factory functions returning default data per type
  templates.ts          # 5 starter template definitions

app/actions/admin/
  landing-pages.ts      # Server actions: CRUD, publish, activate, duplicate

components/admin/landing-page/
  landing-pages-client.tsx    # List view — cards, create, delete, activate
  landing-page-builder.tsx    # Builder — section list + editor panel + inline preview
  preview-banner.tsx          # Banner shown on full-page preview
  section-editor.tsx          # Dispatches to per-type editor
  section-picker.tsx          # Dialog to add new sections
  template-picker.tsx         # Dialog to choose starter template
  editors/
    hero-editor.tsx
    features-editor.tsx
    courses-editor.tsx
    testimonials-editor.tsx
    faq-editor.tsx
    cta-editor.tsx
    stats-editor.tsx
    text-editor.tsx
    image-text-editor.tsx
    video-editor.tsx
    pricing-editor.tsx
    team-editor.tsx

components/public/landing-page/
  landing-page-renderer.tsx   # Renders sections[] → full page (server component)
  sections/
    hero-section.tsx
    features-section.tsx
    courses-section.tsx
    testimonials-section.tsx
    faq-section.tsx
    cta-section.tsx
    stats-section.tsx
    text-section.tsx
    image-text-section.tsx
    video-section.tsx
    pricing-section.tsx
    team-section.tsx

app/[locale]/dashboard/admin/landing-page/
  page.tsx              # Admin route — renders LandingPagesClient
  preview/[pageId]/
    page.tsx            # Preview route — renders page via admin client
```

---

### Admin Builder UX

Route: `/dashboard/admin/landing-page`

**List view**
- Cards per variant with status badges (draft / published / active)
- Create from template picker → opens builder
- Activate, Deactivate, Duplicate, Delete actions
- Only one page can be active at a time (others auto-deactivate)
- Cannot delete the active page

**Builder**
- Left panel: ordered section list with visibility toggles and delete
- Right panel: editor form for selected section
- Add Section button → section picker dialog
- Top bar: page name, Preview toggle, Open in new tab, Save (draft), Publish, back to list
- Debounced auto-save on changes

### Preview

Two preview modes are available:

**Inline preview (iframe)**
- Toggle the "Preview" button in the builder top bar
- Auto-saves before opening; auto-refreshes the iframe after each save
- Editor panel shrinks to 420px; the rest is a live iframe of the rendered page
- Toolbar above the iframe has a manual "Refresh" button

**Full-page preview (new tab)**
- Click "Open in new tab" in the builder, or use the "Preview" dropdown item on page cards
- Route: `/dashboard/admin/landing-page/preview/[pageId]`
- Shows a "Preview Mode" banner at the top with page status and a "Back to Editor" link
- Uses `createAdminClient()` so draft pages are previewable (bypasses RLS)
- Verifies `tenant_id` matches the admin's tenant for isolation

---

### Public Rendering

`app/[locale]/(public)/page.tsx` was modified to:

1. Detect tenant from subdomain
2. If tenant plan is `starter` / `pro` / `business` / `enterprise`:
   - Query `landing_pages` for `is_active = true AND status = 'published'`
   - If found → render `<LandingPageRenderer sections={...} accentColor={tenant.primary_color} />`
3. Otherwise → fall back to `<SchoolLandingPage>` (product grid, unchanged)
4. Default tenant (`00000000-0000-0000-0000-000000000001`) always shows platform homepage

The `courses` and `pricing` section types query the DB directly inside their server components so the admin never needs to manually curate that content.

---

### Feature Gating

- `landing_pages` added to `PlanFeatures` interface in `lib/plans/features.ts`
- `FEATURE_REQUIRED_PLAN.landing_pages = 'starter'`
- Admin route wrapped with `<FeatureGate feature="landing_pages">`
- Free schools see an upgrade nudge, not the builder

---

### Navigation

Admin sidebar (`components/app-sidebar.tsx`) has a "Landing Page" entry under the Management group using `IconLayout`.

---

## Known Behaviors

- The `courses` and `pricing` sections are auto-populated from DB — no manual content needed
- Deactivating a page does not unpublish it; it just stops being served
- Duplicating creates a new draft copy with `(Copy)` appended to the name
- Templates are global — any school can use any template as a starting point
- Section `visible: false` hides it from the public page without deleting it
