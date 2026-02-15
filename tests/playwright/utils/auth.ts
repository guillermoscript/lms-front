import type { Page } from '@playwright/test';

/**
 * Attempt to authenticate a test user with the MCP server, falling back to UI login.
 *
 * Behavior:
 * 1. POSTs to MCP_LOGIN_URL (defaults to http://localhost:3001/mcp/login) with
 *    { email, password }. If the response contains a `cookies` array it will add
 *    those cookies to the browser context and return.
 * 2. If MCP isn't available or doesn't return cookies, visits the app login page
 *    and performs a UI sign-in using common test selectors.
 *
 * TODO: Configure TEST_TEACHER_EMAIL / TEST_TEACHER_PASSWORD for your environment
 * and adapt selectors below if your login page uses different names or testids.
 */
export async function loginAsTeacher(page: Page) {
  const email = process.env.TEST_TEACHER_EMAIL || 'teacher@example.com';
  const password = process.env.TEST_TEACHER_PASSWORD || 'password123';
  const locale = process.env.TEST_LOCALE || 'en';
  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  const mcpLogin = process.env.MCP_LOGIN_URL || 'http://localhost:3001/mcp/login';

  // Try MCP endpoint first for fast programmatic auth
  try {
    const res = await page.request.post(mcpLogin, { data: { email, password } });
    if (res.ok()) {
      const json = await res.json().catch(() => ({} as any));
      if (json && Array.isArray(json.cookies) && json.cookies.length > 0) {
        // Map cookies to Playwright format { name, value, url }
        const cookies = json.cookies.map((c: any) => ({
          name: c.name,
          value: c.value,
          url: baseUrl,
        }));
        await page.context().addCookies(cookies);
        return;
      }

      // Some MCP setups return a redirect URL that sets cookies — follow it
      if (json && typeof json.redirectUrl === 'string') {
        await page.goto(json.redirectUrl);
        return;
      }
    }
  } catch (e) {
    // MCP not available — fall back to UI login below
    // eslint-disable-next-line no-console
    console.warn('MCP login failed or not available, falling back to UI login');
  }

  // UI fallback. Use accessible label selectors first (matches the screenshot), then
  // try common data-testid/name fallbacks.
  // Some routes use /auth/login — try that first, then /login
  const authPaths = [`${baseUrl}/${locale}/auth/login`, `${baseUrl}/${locale}/login`];
  await page.goto(authPaths[0]).catch(() => page.goto(authPaths[1]));

  try {
    // Prefer label-based filling which is resilient to markup changes
    const emailField = page.getByLabel('Email', { exact: false });
    const passwordField = page.getByLabel('Password', { exact: false });
    await emailField.fill(email);
    await passwordField.fill(password);
    const submitButton = page.getByRole('button', { name: /login|sign in|log in/i });
    await Promise.all([
      page.waitForURL(`**/${locale}/dashboard/**`, { timeout: 30_000 }).catch(() => {}),
      submitButton.click(),
    ]);
  } catch (e) {
    // fallbacks for less semantic markup
    const emailSelectors = ['[data-testid="email"]', 'input[name="email"]', 'input[type="email"]', 'input[placeholder]'];
    const passwordSelectors = ['[data-testid="password"]', 'input[name="password"]', 'input[type="password"]'];
    const submitSelectors = ['[data-testid="login-submit"]', 'button[type="submit"]', 'button:has-text("Sign in")', 'button:has-text("Log in")', 'button:has-text("Login")'];

    for (const sel of emailSelectors) {
      try {
        await page.fill(sel, email);
        break;
      } catch (err) {
        // try next
      }
    }

    for (const sel of passwordSelectors) {
      try {
        await page.fill(sel, password);
        break;
      } catch (err) {
        // try next
      }
    }

    let clicked = false;
    for (const sel of submitSelectors) {
      try {
        await Promise.all([
          page.waitForURL(`**/${locale}/dashboard/**`, { timeout: 30_000 }).catch(() => {}),
          page.click(sel),
        ]);
        clicked = true;
        break;
      } catch (err) {
        // try next
      }
    }

    if (!clicked) {
      // As a last resort, press Enter in the password field to submit
      try {
        await page.press('input[type="password"]', 'Enter');
        await page.waitForURL(`**/${locale}/dashboard/**`, { timeout: 30_000 }).catch(() => {});
      } catch (e) {
        // ignore
      }
    }
  }

  // Wait for the dashboard route to appear as a heuristic that login succeeded
  await page.waitForURL(`**/${locale}/dashboard/**`, { timeout: 15_000 }).catch(() => {
    // If the wait fails, tests might still continue — they will likely fail later.
  });
}

export default loginAsTeacher;
