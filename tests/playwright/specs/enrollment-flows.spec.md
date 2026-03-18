# Enrollment Flows E2E Test Specification

Source of truth for enrollment and manual payment request tests.

## Test Accounts

| Account | Email | Tenant | Role |
|---------|-------|--------|------|
| Default Student | `student@e2etest.com` | Default (lvh.me:3000) | student |
| Teacher/Admin | `owner@e2etest.com` | Default (lvh.me:3000) | admin |
| Tenant Student | `alice@student.com` | Code Academy (code-academy.lvh.me:3000) | student |
| Code Academy Admin | `creator@codeacademy.com` | Code Academy (code-academy.lvh.me:3000) | admin |

Password for all: `password123`

## Seeded Data

- **Course 1001**: "Introduction to Testing" (default tenant, published)
- **Course 1002**: "Web Development Basics" (default tenant, published)
- Default student is enrolled in both courses
- Manual product seeded in `beforeAll` if none exists

---

## 1. Browse Page & Enrollment UI

**File:** `enrollment-flows.spec.ts`
**Route:** `/en/dashboard/student/browse`

| # | Assertion | Selector / Method | Type |
|---|-----------|-------------------|------|
| 1.1 | Browse page container visible | `[data-testid="browse-courses-page"]` | testid |
| 1.2 | Browse title visible | `[data-testid="browse-title"]` | testid |
| 1.3 | Course count or empty state shown | `[data-testid="browse-course-count"]` or empty text | testid/text |
| 1.4 | Enrolled courses show dashboard links | `a[href*="/dashboard/student/courses/"]` | locator |

---

## 2. Manual Payment Request Lifecycle

**File:** `enrollment-flows.spec.ts`
**Routes:** `/en/dashboard/student/payments`, `/en/dashboard/admin/payment-requests`

| # | Assertion | Selector / Method | Type |
|---|-----------|-------------------|------|
| 2.1 | Student payments page loads | `[data-testid="payments-page"]` | testid |
| 2.2 | Payments title visible | `[data-testid="payments-title"]` | testid |
| 2.3 | Empty state or existing requests shown | body text length > 50 | content |
| 2.4 | Payment request created via DB visible to admin | `[data-testid="payment-requests-page"]` + content | testid |
| 2.5 | Admin payment requests shows stats cards | body content length > 100 | content |
| 2.6 | Payment request status updated via DB | DB assertion (contacted status) | db |

---

## 3. Payment Requests - Tenant Scoping

**File:** `enrollment-flows.spec.ts`

| # | Assertion | Selector / Method | Type |
|---|-----------|-------------------|------|
| 3.1 | Tenant student sees payments page | `[data-testid="payments-page"]` | testid |
| 3.2 | Admin payment requests loads on code-academy | `[data-testid="payment-requests-page"]` | testid |

---

## Cleanup

- Payment requests with `contact_name = '[E2E] Test Student'` deleted in `afterAll`
- Seeded manual products with name `[E2E] Manual Test Product` deleted in `afterAll`
- Related transactions, enrollments, and product_courses cleaned up
