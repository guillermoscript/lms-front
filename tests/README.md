# LMS V2 - Playwright Test Suite

Comprehensive end-to-end tests for the LMS V2 platform using Playwright.

## Installation

```bash
# Install Playwright
npm init playwright@latest

# Or install dependencies if Playwright is already configured
npm install

# Install browsers
npx playwright install
```

## Running Tests

### Run all tests
```bash
npx playwright test
```

### Run specific test file
```bash
npx playwright test tests/auth/login.spec.ts
```

### Run tests in headed mode (see browser)
```bash
npx playwright test --headed
```

### Run tests in UI mode (interactive)
```bash
npx playwright test --ui
```

### Run tests for specific project (browser)
```bash
npx playwright test --project=chromium
```

### Debug tests
```bash
npx playwright test --debug
```

## View Test Reports

```bash
npx playwright show-report
```

## Test Structure

```
tests/
├── auth/
│   └── login.spec.ts          # Login authentication tests
├── student/
│   ├── dashboard.spec.ts      # Student dashboard tests
│   └── lessons.spec.ts        # Lesson viewer and course detail tests
├── teacher/
│   └── (coming soon)          # Teacher dashboard tests
├── admin/
│   └── (coming soon)          # Admin dashboard tests
└── README.md                  # This file
```

## Test Accounts

The tests use seed data accounts:

- **Student**: student@test.com / password123
- **Teacher**: teacher@test.com / password123
- **Admin**: admin@test.com / password123

Make sure to run the seed script before testing:

```bash
npm run seed
```

## Known Issues & Skipped Tests

Some tests are currently skipped due to known issues:

### Skipped Tests

1. **Admin Login Test** (`tests/auth/login.spec.ts`)
   - **Reason**: Admin authentication not working
   - **Status**: Database role assignment issue
   - **Fix Required**: Verify admin user in `user_roles` table

2. **Comments Tests** (`tests/student/lessons.spec.ts`)
   - **Reason**: `comments` table doesn't exist in database
   - **Status**: Migration needed
   - **Fix Required**: Create comments table with RLS policies

3. **Reviews Tests** (`tests/student/lessons.spec.ts`)
   - **Reason**: Database schema mismatch
   - **Status**: Column name mismatch
   - **Fix Required**: Update schema or component queries

4. **Lesson Completion Test** (`tests/student/lessons.spec.ts`)
   - **Reason**: RLS policy blocks INSERT to `lesson_completions`
   - **Status**: Critical - progress tracking broken
   - **Fix Required**: Add RLS INSERT policy for students

### Re-enabling Skipped Tests

Once the database issues are fixed, remove the `.skip()` calls from these tests:

```typescript
// Before fix
test.skip('should login as admin', async ({ page }) => {

// After fix
test('should login as admin', async ({ page }) => {
```

## Writing New Tests

### Basic Test Structure

```typescript
import { test, expect } from '@playwright/test'

test.describe('Feature Name', () => {
  test.beforeEach(async ({ page }) => {
    // Setup before each test
  })

  test('should do something', async ({ page }) => {
    // Test implementation
  })
})
```

### Helper Functions

Create reusable helper functions for common actions:

```typescript
async function loginAsStudent(page) {
  await page.goto('/auth/login')
  await page.getByRole('textbox', { name: 'Email' }).fill('student@test.com')
  await page.getByRole('textbox', { name: 'Password' }).fill('password123')
  await page.getByRole('button', { name: 'Login' }).click()
  await page.waitForLoadState('networkidle')
}
```

### Best Practices

1. **Use semantic selectors**: Prefer `getByRole`, `getByText`, `getByLabel` over CSS selectors
2. **Wait for elements**: Use `waitForLoadState` or `expect().toBeVisible()` instead of fixed timeouts
3. **Test user flows**: Test complete workflows, not just individual components
4. **Clean up**: Use `beforeEach` and `afterEach` for setup/teardown
5. **Descriptive names**: Test names should clearly describe what they test
6. **Assertions**: Always have at least one assertion per test

## Debugging Tips

### View trace
```bash
npx playwright test --trace on
```

Then view traces:
```bash
npx playwright show-trace trace.zip
```

### Pause execution
Add `await page.pause()` in your test to stop execution and inspect.

### Screenshots
Take screenshots during tests:
```typescript
await page.screenshot({ path: 'screenshot.png' })
```

### Video
Videos are automatically recorded on failure (configured in `playwright.config.ts`)

## CI/CD Integration

The suite runs in GitHub Actions on every pull request and on every push to
`master` — job `e2e` in `.github/workflows/ci.yml` (#667). `deploy.yml` waits
for that workflow to pass before it builds and ships the image.

What the job does, per shard (4 shards, `fail-fast: false`):

1. `supabase start` — the local stack with migrations + `seed.sql`, same state
   as `npm run db:reset`.
2. Exports the stack's anon / service-role keys into the job env.
3. `npm run build`, then Playwright's `webServer` starts `next start` on
   `lvh.me:3000` (`/etc/hosts` pins `lvh.me`, `default.lvh.me`,
   `code-academy.lvh.me`).
4. `npx playwright test --project=desktop-chromium --shard=N/4`. Tests inside
   a shard run serially (`workers: 1`) because they mutate one shared database.
5. `node scripts/ci/check-e2e-skips.mjs` writes the job summary
   (passed / failed / flaky / skipped) and **fails the job if any test skipped
   because an env var was missing**. Project-gated skips
   (`runs once — DB state is shared`) and permanent skips are listed, not
   failed.

Every env var a spec gates on is set in the job (`CRON_SECRET`,
`SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_PLATFORM_WEBHOOK_SECRET`, …) with
synthetic values. If you add a `test.skip(!process.env.X, …)`, add `X` to the
job env or the gate turns red.

Nightly (`schedule`) the job also runs the `mobile` project. `workflow_dispatch`
takes an `e2e_projects` input for ad-hoc runs. Reports and traces are uploaded
as `playwright-report-shard-N` artifacts.

## Test Coverage Goals

- **Authentication**: 100% (all login scenarios)
- **Student Dashboard**: 90% (all major flows)
- **Teacher Dashboard**: 80% (course creation, management)
- **Admin Dashboard**: 70% (oversight features)
- **Edge Cases**: 60% (error handling, validation)

## Current Test Status

### Implemented ✅
- [x] Login flow (student, teacher, admin)
- [x] Student dashboard display
- [x] Course detail page
- [x] Lesson viewer with navigation
- [x] Markdown content rendering
- [x] Video embeds
- [x] Responsive design tests

### Pending ⏳
- [ ] Signup flow
- [ ] Password reset
- [ ] Course creation (teacher)
- [ ] Lesson creation (teacher)
- [ ] Exam creation (teacher)
- [ ] Exam taking (student)
- [ ] Admin user management
- [ ] Admin course oversight
- [ ] Payment flow
- [ ] Profile management
- [ ] Error handling
- [ ] Form validation

## Contributing

When adding new tests:

1. Follow the existing file structure
2. Add to appropriate directory (`auth/`, `student/`, `teacher/`, `admin/`)
3. Use TypeScript
4. Add JSDoc comments for complex tests
5. Update this README with new test descriptions
6. Document any known issues or skipped tests

## Resources

- [Playwright Documentation](https://playwright.dev)
- [Playwright Test API](https://playwright.dev/docs/api/class-test)
- [Playwright Selectors](https://playwright.dev/docs/selectors)
- [Best Practices](https://playwright.dev/docs/best-practices)

---

**Last Updated**: January 31, 2026
**Test Framework**: Playwright
**Status**: ⚠️ Partial Coverage (database issues preventing full testing)
