# Admin CRUD Operations — Test Specification

> Source of truth for `tests/playwright/admin-crud.spec.ts`
> Last updated: 2026-03-16

## Overview

These tests go **beyond page loads** to verify that admin CRUD forms render correctly, form fields are interactive, course selectors work (regression), and list pages display meaningful data. Tests intentionally avoid submitting forms to prevent data pollution.

## Test Data

| Item | Value |
|------|-------|
| Code Academy tenant base URL | `http://code-academy.lvh.me:3000` (TENANT_BASE) |
| Admin account | `creator@codeacademy.com` / `password123` |
| Login helper | `loginAsAdmin(page)` — logs in on TENANT_BASE by default |
| Seeded data | Code Academy has published courses, products, plans, users, enrollments |

## Test Cases

### 1. Product Management (5 tests)

| # | Test | Route | Assertions | Selectors / Notes |
|---|------|-------|------------|-------------------|
| 1 | products page displays product cards with prices | `/en/dashboard/admin/products` | `[data-testid="products-page"]` visible; at least one card with a price (`$` or `€`) | Text matching `/\$[\d.]+\|€[\d.]+/` |
| 2 | new product form loads with all required fields | `/en/dashboard/admin/products/new` | Name input, description textarea, price input (type=number), currency select, image URL input, course selector area, submit button visible | `label[for="name"]`, `label[for="description"]`, `label[for="price"]` (type=number), `label[for="image"]` |
| 3 | course selector renders courses in new product form | `/en/dashboard/admin/products/new` | Course selector section visible; at least one checkbox-like course item rendered (regression for refactored CourseSelector) | ScrollArea with course items; search input in course selector |
| 4 | product form fields accept input without submission | `/en/dashboard/admin/products/new` | Fill name, description, price fields; verify values are reflected in inputs | Fill + assert input values |
| 5 | existing product edit page loads with pre-filled data | `/en/dashboard/admin/products` | Navigate to products; click first edit button; edit page loads with name input containing a non-empty value | `a[href*="/products/"][href*="/edit"]` first; `#name` input not empty |

### 2. Plan Management (4 tests)

| # | Test | Route | Assertions | Selectors / Notes |
|---|------|-------|------------|-------------------|
| 6 | plans page displays plan cards with pricing | `/en/dashboard/admin/plans` | `[data-testid="plans-page"]` visible; at least one card with a price | Text matching `/\$[\d.]+\|€[\d.]+/` |
| 7 | new plan form loads with all required fields | `/en/dashboard/admin/plans/new` | Plan name, description, price, currency select, duration select, features textarea, course selector, submit button | `label[for="plan_name"]`, `label[for="price"]`, `label[for="features"]` |
| 8 | course selector renders courses in new plan form | `/en/dashboard/admin/plans/new` | Course selector visible with courses listed (regression) | ScrollArea with checkboxes |
| 9 | plan form fields accept input without submission | `/en/dashboard/admin/plans/new` | Fill plan_name, description, price; verify values | Fill + assert input values |

### 3. User Management (4 tests)

| # | Test | Route | Assertions | Selectors / Notes |
|---|------|-------|------------|-------------------|
| 10 | users page shows user list with roles and stats | `/en/dashboard/admin/users` | `[data-testid="users-page"]` visible; stats cards visible (total users, teachers, students); table with at least one row | Stats cards with numbers; `table` with `tbody tr` |
| 11 | users table supports search filtering | `/en/dashboard/admin/users` | Type a search query in search input; table updates (row count changes or stays filtered) | `input[type="search"]`; count rows before/after |
| 12 | user detail page loads with profile and sections | `/en/dashboard/admin/users` | Click first "View" link; detail page loads with profile card, roles card, enrollments section, recent activity section | `a[href*="/admin/users/"]`; cards with headings |
| 13 | user detail page shows enrollments and activity sections | Navigate from test 12 | Enrollments card heading visible; recent activity card heading visible; transactions card heading visible | Card headings for enrollments, activity, transactions |

### 4. Enrollment Management (3 tests)

| # | Test | Route | Assertions | Selectors / Notes |
|---|------|-------|------------|-------------------|
| 14 | enrollments page shows enrollment table with headers | `/en/dashboard/admin/enrollments` | `[data-testid="enrollments-page"]` visible; stats cards (total, active, completed); table headers (student, course, status, enrolled) | `th` elements in table |
| 15 | enrollment rows display student name, course, and status badge | `/en/dashboard/admin/enrollments` | At least one table row with student name, course title, and a status badge | `tbody tr` with `td` content and `Badge` |
| 16 | enrollments page shows stats cards with counts | `/en/dashboard/admin/enrollments` | Three stats cards visible with numeric values | Cards with stat numbers |

### 5. Category Management (2 tests)

| # | Test | Route | Assertions | Selectors / Notes |
|---|------|-------|------------|-------------------|
| 17 | categories page loads with table and add button | `/en/dashboard/admin/categories` | `[data-testid="categories-page"]` visible; stats card with total count; table with name/description/courses/actions headers; "Add" button visible | `th` headers; button with plus icon |
| 18 | categories table shows category rows with course counts | `/en/dashboard/admin/categories` | Table has at least one row (or empty state message); if rows exist, they show name and course count badge | `tbody tr` content |

## Notes

- All tests run on the Code Academy tenant (TENANT_BASE) since `loginAsAdmin` defaults to that domain.
- Tests 4 and 9 fill form fields but **never submit** to avoid creating test data.
- Test 5 is conditional: it only navigates to edit if a product exists with an edit link.
- Tests 12-13 are combined in implementation: navigate to user detail once, verify all sections.
- All tests use `test.setTimeout(60_000)` since admin pages involve multiple database queries.
- Priority: **P1** (admin CRUD functionality beyond simple page loads).
