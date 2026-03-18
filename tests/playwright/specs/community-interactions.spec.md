# Community Interactions E2E Test Specification

Source of truth for community post creation, feature gating, and cross-tenant isolation tests.

## Test Accounts

| Account | Email | Tenant | Role |
|---------|-------|--------|------|
| Default Student | `student@e2etest.com` | Default (lvh.me:3000) | student |
| Code Academy Admin | `creator@codeacademy.com` | Code Academy (code-academy.lvh.me:3000) | admin |
| Tenant Student | `alice@student.com` | Code Academy (code-academy.lvh.me:3000) | student |

Password for all: `password123`

## Plan Context

- Default tenant: free plan -- community may be gated (shows upgrade nudge)
- Code Academy tenant: business plan -- community should be enabled

---

## 1. Community Feature Gating

**File:** `community-interactions.spec.ts`
**Route:** `/en/dashboard/student/community` (default tenant)

| # | Assertion | Selector / Method | Type |
|---|-----------|-------------------|------|
| 1.1 | Page loads with heading | `h1` visible | role |
| 1.2 | Shows upgrade nudge OR community header | `text=/upgrade/i` or `[data-tour="community-header"]` | text/attr |

---

## 2. Community on Code Academy

**File:** `community-interactions.spec.ts`
**Route:** `/en/dashboard/admin/community` (code-academy tenant)

| # | Assertion | Selector / Method | Type |
|---|-----------|-------------------|------|
| 2.1 | Admin community page loads | `h1` visible | role |
| 2.2 | Composer visible when community enabled | `[data-tour="community-composer"]` | attr |
| 2.3 | Filters visible when community enabled | `[data-tour="community-filters"]` | attr |
| 2.4 | Moderation link visible for admin | `a[href*="moderation"]` | locator |

---

## 3. Post Creation via DB

**File:** `community-interactions.spec.ts`

| # | Assertion | Method | Type |
|---|-----------|--------|------|
| 3.1 | Post can be inserted and queried | DB insert + select | db |
| 3.2 | Posts are tenant-isolated | DB insert + tenant filter query | db |

---

## 4. Sidebar Navigation

**File:** `community-interactions.spec.ts`

| # | Assertion | Selector | Type |
|---|-----------|----------|------|
| 4.1 | Student sidebar has community link | `a[href*="/dashboard/student/community"]` | locator |
| 4.2 | Admin sidebar has community link | `a[href*="/dashboard/admin/community"]` | locator |

---

## Cleanup

- All `[E2E]` prefixed community posts deleted in `afterAll`
- Related reactions and comments cleaned up before post deletion (FK constraints)
