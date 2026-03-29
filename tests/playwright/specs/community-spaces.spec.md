# Community Spaces E2E Test Specification

Source of truth for community feature E2E tests. Covers school-level community feed for all roles, page structure, and tenant isolation.

## Test Accounts

| Account | Email | Tenant | Role |
|---------|-------|--------|------|
| Default Student | `student@e2etest.com` | Default (lvh.me:3000) | student |
| Default Teacher | `owner@e2etest.com` | Default (lvh.me:3000) | teacher |
| Tenant Admin | `creator@codeacademy.com` | Code Academy (code-academy.lvh.me:3000) | admin |
| Tenant Student | `alice@student.com` | Code Academy (code-academy.lvh.me:3000) | student |

Password for all: `password123`

## Feature Context

- Community requires `starter` plan or higher (feature gate: `community: 'starter'`)
- If plan does not include community, an `UpgradeNudge` is shown instead of the feed
- All community pages use `data-tour` attributes (not `data-testid`) for tour integration
- Key `data-tour` selectors: `community-header`, `community-composer`, `community-filters`, `community-feed`, `community-reactions`, `community-moderation`
- Community posts are tenant-scoped; school-level posts have `course_id IS NULL`
- Admin page includes a moderation button linking to `/dashboard/admin/community/moderation`

---

## 1. Student Community Page

**File:** `community.spec.ts`
**Route:** `/en/dashboard/student/community`

| # | Assertion | Selector | Type |
|---|-----------|----------|------|
| 1.1 | Page loads without error (h1 with "Community" visible) | `h1` with community title text | text |
| 1.2 | Header section with description visible | `[data-tour="community-header"]` | data-tour |
| 1.3 | Post composer area visible (or upgrade nudge if free plan) | `[data-tour="community-composer"]` or upgrade nudge | data-tour / component |
| 1.4 | Post filter controls visible | `[data-tour="community-filters"]` | data-tour |
| 1.5 | Feed area renders (posts or empty state) | `[data-tour="community-feed"]` or empty feed component | data-tour / component |

---

## 2. Teacher Community Page

**File:** `community.spec.ts`
**Route:** `/en/dashboard/teacher/community`

| # | Assertion | Selector | Type |
|---|-----------|----------|------|
| 2.1 | Page loads without error (h1 with community title) | `h1` with community title text | text |
| 2.2 | Header section visible | `[data-tour="community-header"]` | data-tour |
| 2.3 | Composer and filters visible | `[data-tour="community-composer"]`, `[data-tour="community-filters"]` | data-tour |

---

## 3. Admin Community Page

**File:** `community.spec.ts`
**Route:** `/en/dashboard/admin/community`

| # | Assertion | Selector | Type |
|---|-----------|----------|------|
| 3.1 | Page loads without error (h1 with community title) | `h1` with community title text | text |
| 3.2 | Moderation button visible (links to moderation page) | `a[href*="moderation"]` with button | locator |
| 3.3 | Header section visible | `[data-tour="community-header"]` | data-tour |
| 3.4 | Moderation tour anchor visible | `[data-tour="community-moderation"]` | data-tour |

---

## 4. Sidebar Navigation

**File:** `community.spec.ts`
**Route:** any dashboard page

| # | Assertion | Selector | Type |
|---|-----------|----------|------|
| 4.1 | Student sidebar contains community link | `a[href*="/dashboard/student/community"]` | locator |
| 4.2 | Admin sidebar contains community link | `a[href*="/dashboard/admin/community"]` | locator |

---

## 5. Cross-Tenant Isolation

**File:** `community.spec.ts`
**Route:** `/en/dashboard/admin/community` on Code Academy tenant

| # | Assertion | Selector | Type |
|---|-----------|----------|------|
| 5.1 | Tenant admin community page loads on tenant subdomain | `h1` with community title | text |
| 5.2 | Community feed or upgrade nudge is tenant-scoped (no cross-tenant posts leak) | Page renders without errors | structural |

---

## Notes

- Tests do NOT create posts, comments, or reactions to avoid data pollution
- Community may show `UpgradeNudge` on free-plan tenants instead of the feed; tests handle both states
- The `CommunityTour` auto-starts on first visit (localStorage-based) but does not block page rendering
