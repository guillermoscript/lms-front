# Student-facing Playwright Test Plan

## Application Overview

Comprehensive discovery, acceptance flows, environment notes, runbook, and triage guidance for validating student-facing flows in the LMS V2 (local). Focus: login, enrolled courses, lessons, exams, progress, logout. Assumes local dev at http://localhost:3000 and Playwright installed as a devDependency.

## Test Scenarios

### 1. Student Flows Plan & Runbook

**Seed:** `tests/seed.spec.ts`

#### 1.1. Discovery - existing Playwright tests

**File:** `DISCOVERY`

**Steps:**
  1. Enumerate discovered Playwright test files and short summary
    - expect: tests/seed.spec.ts — seed placeholder test (no-op)
    - expect: test-purchase-flow.spec.ts — free course enrollment and login + enroll tests
    - expect: tests/student/student-flow.spec.ts — full end-to-end student flows using Supabase admin API (subscriptions, enrollments, lesson completion, purchases)
    - expect: tests/purchase-flow.spec.ts — purchase and product/payment tests with DB assertions
    - expect: tests/student/lessons.spec.ts — lesson viewer tests (content rendering, navigation, completion - some tests skipped)
    - expect: tests/student/dashboard.spec.ts — dashboard UI and navigation tests
    - expect: tests/admin/products-manual-payment.spec.ts — admin product creation and manual payment flows (admin + student paths)
    - expect: tests/exam-auto-grading.spec.ts — exam creation and AI auto-grading end-to-end tests (teacher + student flows)
    - expect: tests/auth/login.spec.ts — authentication tests for student/teacher (admin test skipped)

#### 1.2. package.json and test commands

**File:** `PACKAGE_JSON`

**Steps:**
  1. Inspect package.json scripts and test runner configuration
    - expect: No explicit "test" or "playwright" script in package.json. Playwright is present as devDependency (@playwright/test). Use npx playwright test to run tests.
    - expect: Dev server start command: npm run dev (maps to next dev). Default local URL: http://localhost:3000 unless environment overrides it.

#### 1.3. Environment & Setup discovery

**File:** `ENV_AND_SETUP`

**Steps:**
  1. Identify environment files and test credentials referenced by tests
    - expect: Multiple tests load .env.local via dotenv (e.g., resolve(__dirname, '../../.env.local')). Tests require NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for supabase.admin operations.
    - expect: If .env.local contains the SUPABASE_SERVICE_ROLE_KEY then tests that create/delete users and check DB will work. This file is not present in repo by default and must be provided by operator.
  2. Search for hardcoded test credentials inside tests
    - expect: Common test credential strings used in tests: student@test.com / password123, teacher@test.com / password123, admin@example.com or admin@test.com with admin123 or student123. These are example/test accounts embedded in tests but may not exist in the DB.

#### 1.4. Test credentials and recommended fallback

**File:** `CREDENTIALS_PLAN`

**Steps:**
  1. Document where to find credentials and recommended safe defaults
    - expect: If .env.local is present at repo root it stores Supabase URL and SERVICE_ROLE_KEY (sensitive) — do not commit. If present, tests will use it to create/delete users.
    - expect: If no service key exists, recommended local test account for manual validation: email=playwright.student@example.com password=Password123!
    - expect: Steps to create UI account manually: 1) Start dev server (npm run dev) 2) Visit http://localhost:3000/auth/sign-up 3) Fill email and password above and submit 4) Complete any profile creation steps in the UI 5) If email confirmation blocks sign-in, either (a) set email_confirm via Supabase admin (requires service key) or (b) disable confirmation in local auth config for test environment.

#### 1.5. Acceptance Flow: Login -> student dashboard

**File:** `ACCEPTANCE_LOGIN`

**Steps:**
  1. Open login page /auth/login
    - expect: Login page renders; heading and email/password fields visible (selectors: getByRole('textbox', {name: 'Email'}) and getByRole('textbox', {name: 'Password'}) ).
  2. Fill credentials and submit
    - expect: Fill with test account; click Login button (selector: getByRole('button', {name: 'Login'}) or button[type='submit']). Wait for navigation to /dashboard/student (waitForURL('**/dashboard/student', { timeout:15000 })).
    - expect: Assert: page URL matches /dashboard/student and dashboard heading 'My Learning' is visible. Failure: remains on /auth/login or shows login error.
  3. Alternatives if selectors unstable
    - expect: If role selectors fail use input[type='email'] and input[type='password'] or input[name='email'] selectors. If redirected to /protected, navigate to /dashboard/student as fallback.

#### 1.6. Acceptance Flow: Enrolled courses list on dashboard

**File:** `ACCEPTANCE_ENROLLED_COURSES`

**Steps:**
  1. From student dashboard, locate enrolled courses section
    - expect: Look for 'In-Progress Courses' or course card links: selector examples: page.getByText('In-Progress Courses') and page.getByRole('link', { name: /Introduction to JavaScript/ }).
    - expect: Assert: at least one enrolled course card exists (locator count > 0). Failure: user has no enrollments; create one via UI or Supabase admin.
  2. Verify course card details
    - expect: Check card shows title, description and a progress indicator (text matching /\d+% complete/ or /\d+\/\d+ lessons/). Click the card and assert navigation to /dashboard/student/courses/<id>. Failure: title or progress missing.

#### 1.7. Acceptance Flow: Lesson viewing and completion

**File:** `ACCEPTANCE_LESSONS`

**Steps:**
  1. Open lesson page for an enrolled course (URL: /dashboard/student/courses/:courseId/lessons/:lessonId)
    - expect: MDX content renders: headings and code blocks visible (getByRole('heading', {name: '...'}), locator('pre code')). Video iframe check: frameLocator('iframe').first().locator('text=/YouTube|Watch on/'). Should be visible if lesson has embed.
  2. Mark lesson complete
    - expect: Click completion button: page.getByRole('button', { name: /Mark as Complete|Complete/ }) or locator('button:has-text("Mark as Complete")'). Wait for confirmation toast or navigation, then reload page and verify completed state persists (e.g., sidebar link has data-completed='true' or progress increased). Alternative: wait for network response to lesson_completions endpoint and validate status 200. Failure: no confirmation or persistence not observed — check RLS/DB.
  3. Alternative selectors & waits
    - expect: If button text changes, locate by css selector or add data-testid attributes. Use explicit waits: await page.waitForResponse(resp => resp.url().includes('/lesson_completions') && resp.status() === 200). Increase timeouts for slow DB writes.

#### 1.8. Acceptance Flow: Exam take and submit

**File:** `ACCEPTANCE_EXAMS`

**Steps:**
  1. Navigate to exams listing from course or /dashboard/student/courses/:id/exams
    - expect: Exams page shows 'Start Exam' buttons (selector: getByRole('button', {name: 'Start Exam'})).
  2. Start exam and answer questions
    - expect: On exam runner page, interact with questions: for MCQ click label: page.click('label:has-text("<option text>")') or use radio inputs; for free-text fill textarea with 'test answer'.
  3. Submit exam and verify result
    - expect: Click 'Finish & Submit' (button:has-text). Wait for result page or score UI: expect(page.locator('text=/Score:|Your Score/')).toBeVisible({ timeout: 10000 }). If AI grading is asynchronous, increase timeout and wait for specific polling requests to complete. Failure: submission errors or no score displayed — check network, exam data presence, and AI job processing pipeline.

#### 1.9. Acceptance Flow: Progress reflects completions

**File:** `ACCEPTANCE_PROGRESS`

**Steps:**
  1. After lesson completion or exam submission, open course overview or dashboard
    - expect: Assert progress indicator updated (percentage or lessons completed count). Recommended approach: capture current value before action, perform action, then re-check value increment. Failure: no update — investigate persistence and front-end caching.

#### 1.10. Acceptance Flow: Logout and route protection

**File:** `ACCEPTANCE_LOGOUT`

**Steps:**
  1. Trigger logout via UI (button or menu link 'Sign out'/'Logout')
    - expect: After logout, assert redirection to /auth/login or home. Attempt to access /dashboard/student and assert redirect to /auth/login. Failure: protected routes still accessible — session cookie not cleared.

#### 1.11. Commands to run the tests

**File:** `RUN_COMMANDS`

**Steps:**
  1. Install dependencies and start dev server
    - expect: npm ci (or npm install)
    - expect: npm run dev — starts Next.js dev server at http://localhost:3000 (verify console 'ready' message).
  2. Run Playwright full suite and single file runs
    - expect: Run full suite: npx playwright test --headed --retries=0 --trace on --output=./playwright-results
    - expect: Run a single spec: npx playwright test tests/student/lessons.spec.ts --headed --trace on --output=./playwright-results
    - expect: Collect traces for failing tests: npx playwright test <file> --trace on

#### 1.12. Triage steps and artifact capture

**File:** `TRIAGE_CHECKLIST`

**Steps:**
  1. When a test fails capture artifacts and debug
    - expect: Rerun failing test with --trace on and --headed to capture trace and visual context
    - expect: Open trace: npx playwright show-trace <trace.zip or trace file>
    - expect: Collect screenshot and console logs (Playwright can auto-save screenshots on failure when configured). Use page.screenshot in a debug run if needed.
  2. Narrow down flaky selectors or timing issues
    - expect: Replace fragile text selectors with getByRole or data-testid attributes, wait for network responses or element visibility before actions, and increase timeouts for async flows such as AI grading. Use page.waitForResponse for specific endpoints.
  3. Likely fixes to try
    - expect: 1) Update selectors to stable roles or data-testid attributes. 2) Add explicit waits for network responses before asserting UI updates. 3) Ensure test accounts and DB fixtures are present or mock backend calls where appropriate.

#### 1.13. Run report template

**File:** `REPORT_TEMPLATE`

**Steps:**
  1. After executing test run, fill the following report fields
    - expect: Total tests run: <number>
    - expect: Passing: <number>
    - expect: Failing: <number>
    - expect: Flaky: <list and occurrences>
    - expect: Failing tests: file, test name, failing assertion message, stack/line reference
    - expect: Suggested fixes: 1-3 prioritized recommendations
    - expect: Artifacts: paths to traces/screenshots/console logs

#### 1.14. Immediate recommended changes (ranked)

**File:** `RECOMMENDED_FIXES`

**Steps:**
  1. Top 3 prioritized improvements to increase reliability
    - expect: 1) Add data-testid attributes for critical actions: login button, enroll button, start course, mark-complete, start/submit exam. This enables stable selectors.
    - expect: 2) Provide a test seed script or documented local seeding steps that create a predictable published course with lessons and an exam, and a test student (or seed Supabase with test fixtures).
    - expect: 3) Make tests more robust: use getByRole/getByTestId, wait for network responses, and increase timeouts for async processes (AI grading).

#### 1.15. Exact steps for the human runner or Playwright agent

**File:** `EXECUTION_INSTRUCTIONS`

**Steps:**
  1. A - Install dependencies
    - expect: npm ci (or npm install)
  2. B - Start development server
    - expect: npm run dev — wait until server ready at http://localhost:3000
  3. C - Run Playwright tests (initial debug run)
    - expect: npx playwright test --headed --retries=0 --trace on --output=./playwright-results
    - expect: To run a single test file: npx playwright test tests/student/lessons.spec.ts --headed --trace on --output=./playwright-results
  4. D - Manual acceptance testing
    - expect: Open a headed session and perform flows manually if troubleshooting flakiness using the selectors and steps in Acceptance Flows section

#### 1.16. One-paragraph test health summary

**File:** `SUMMARY`

**Steps:**
  1. -
    - expect: Summary: The repository contains a comprehensive set of Playwright end-to-end tests covering student, teacher, and admin flows, including purchases and AI exam grading. Many tests depend on Supabase service-role credentials and seeded data; without those, tests that create users or assert DB rows will fail. Several UI tests use text-based selectors that are somewhat fragile (prone to UI text changes) and some tests are skipped due to known DB or RLS issues. Confidence to ship core student flows locally is medium: UI navigation and static content render tests are robust, but persistence-dependent flows (enrollments, lesson completions, exam grading) require stable DB fixtures or a service role key to be fully reliable. Recommended immediate actions are adding test IDs, adding a test seeding script, and hardening waits/selectors.
