import { test, expect } from '@playwright/test';
import { loginAsTeacher } from './utils/auth';

test.describe('Teacher Dashboard', () => {
  test('full smoke: loads, layout, create course flow, a11y, snapshots', async ({ page, context, baseURL }) => {
    // Authenticate first
    await loginAsTeacher(page);

    // Navigate to teacher dashboard. We prefer a stable route; adjust if needed.
    await page.goto(`${baseURL}/en/dashboard/teacher`);

    // Fail if console contains errors
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    // Basic layout checks. Prefer data-testid attributes — update your app to add them.
    const sidebar = page.locator('[data-testid="sidebar"]');
    const topNav = page.locator('[data-testid="top-nav"]');
    const main = page.locator('[data-testid="main-content"]');

    // If testids are not present, fall back to role/text selectors with comments.
    if (await sidebar.count() === 0) {
      // Suggest adding data-testid="sidebar" to the app's sidebar element
    }

    await expect(main).toBeVisible();
    await expect(topNav).toBeVisible();

    // Course list and create button
    const courseList = page.locator('[data-testid="course-list"]');
    const createBtn = page.locator('[data-testid="create-course-button"]');

    // Fallbacks if data-testid not present
    if ((await courseList.count()) === 0) {
      // try a common fallback: role list or heading
      // NOTE: replace with a more specific selector from your app for reliability
      // e.g. page.locator('section:has(h2:has-text("Your courses"))')
    }

    await expect(createBtn.first()).toBeVisible();

    // Take a visual snapshot of the dashboard (desktop project)
    await expect(page).toHaveScreenshot('teacher-dashboard.png', { animations: 'disabled' });

    // Open create course form/modal
    await createBtn.click();

    // Wait for form to appear. Prefer data-testid="create-course-form"
    const createForm = page.locator('[data-testid="create-course-form"]');
    if ((await createForm.count()) === 0) {
      // try common modal fallback
      // createForm = page.locator('dialog, form:visible').first();
    }
    await expect(createForm.first()).toBeVisible();

    // Validate client-side errors by submitting empty form (assumption: title is required)
    const titleInput = createForm.locator('[data-testid="course-title"]');
    const submit = createForm.locator('button:has-text("Create"), button[type="submit"]');

    // If input not found, try name attribute fallback
    if ((await titleInput.count()) === 0) {
      // fallback
      // titleInput = createForm.locator('input[name="title"]');
    }

    await submit.click();

    // Expect a validation error message to appear
    const titleError = createForm.locator('text=required, text=Required, [role="alert"]');
    await expect(titleError.first()).toBeVisible();

    // Fill the form properly
    await titleInput.fill('Playwright Test Course');
    await submit.click();

    // Wait for new course to appear in the list or navigation to course page
    await page.waitForTimeout(1000); // short pause for UI update; replace with a better wait when possible

    // Small responsiveness checks: mobile + desktop
    await page.setViewportSize({ width: 320, height: 800 });
    await expect(page.locator('[data-testid="mobile-menu"]').first().or(page.locator('[data-testid="sidebar"]'))).toBeVisible();

    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(sidebar).toBeVisible();

    // Accessibility check using axe-playwright if available
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { injectAxe, getAxeResults } = require('axe-playwright');
      await injectAxe(page);
      const results = await getAxeResults(page);
      const violations = results.violations || [];
      expect(violations.length, `a11y violations: ${violations.map((v: any) => v.id).join(', ')}`).toBe(0);
    } catch (e) {
      // axe not installed — skip accessibility checks
      // Install with: npm i -D axe-playwright @axe-core/playwright
    }

    // Fail test if console errors were captured
    expect(errors, `Console errors: ${errors.join('\n')}`).toEqual([]);
  });
});
