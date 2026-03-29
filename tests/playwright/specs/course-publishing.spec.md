# Course Publishing E2E Test Specification

Source of truth for course publishing/unpublishing flow tests.

## Test Accounts

| Account | Email | Tenant | Role |
|---------|-------|--------|------|
| Teacher/Admin | `owner@e2etest.com` | Default (lvh.me:3000) | admin/teacher |
| Default Student | `student@e2etest.com` | Default (lvh.me:3000) | student |

Password for all: `password123`

## Seeded Data

- **Course 1001**: "Introduction to Testing" (default tenant, published, 2 lessons)
- Teacher/Admin owns this course

---

## 1. Course Settings Page

**File:** `course-publishing.spec.ts`
**Route:** `/en/dashboard/teacher/courses/1001/settings`

| # | Assertion | Selector / Method | Type |
|---|-----------|-------------------|------|
| 1.1 | Settings page renders with heading | `h1` visible | role |
| 1.2 | Status select dropdown visible | `#status` | id |
| 1.3 | Course title in breadcrumb area | body text matches "Introduction to Testing" | text |
| 1.4 | Danger zone section visible | `.border-destructive/30` | class |

---

## 2. Course Status Toggle (via DB)

**File:** `course-publishing.spec.ts`
**Serial execution required**

| # | Assertion | Selector / Method | Type |
|---|-----------|-------------------|------|
| 2.1 | Set to draft via DB -> not visible in browse | DB update + browse page check | db+ui |
| 2.2 | Restore to published via DB -> visible in browse | DB update + browse page shows "Introduction to Testing" | db+ui |
| 2.3 | DB confirms status is published | DB select assertion | db |

---

## 3. Teacher Course Form - Status

**File:** `course-publishing.spec.ts`

| # | Assertion | Selector / Method | Type |
|---|-----------|-------------------|------|
| 3.1 | Status selector shown with current value | `#status` visible | id |
| 3.2 | Submit/update button visible | `button[type="submit"]` | locator |

---

## Cleanup

- Course 1001 status always restored to `published` in `afterAll` hooks
- No permanent data mutations
