/**
 * `@playwright/test`, with a `page` that waits for React's streamed Suspense
 * content to be revealed after every full document load.
 *
 * React 19.2 batches Suspense reveals: `$RC` parks a finished boundary's HTML in
 * a hidden `<div hidden id="S:n">` and moves it into place on the next animation
 * frame (or up to ~300 ms later, `$RV`). Hydration can render that content into
 * the page first, so for a moment the DOM holds two copies of it, one hidden.
 * Users never see the hidden one, but a strict locator (`getByTestId`) that
 * looks during that window throws "strict mode violation: resolved to 2
 * elements". That flake hit a different page every night (worst on the slower
 * `mobile` project), so the wait lives here once, after `goto` and `reload` of
 * every page a test opens.
 *
 * Client-side navigations stream RSC, not HTML, and never create these nodes.
 *
 * Every spec imports `test`/`expect` from here, not from `@playwright/test`.
 */
import { test as base, type Browser, type BrowserContext, type Page } from '@playwright/test'

export * from '@playwright/test'

const STREAMED_SEGMENT = 'div[hidden][id^="S:"]'

/** Wait until React has moved every streamed Suspense segment into place. */
export async function waitForStreamedContent(page: Page): Promise<void> {
  await page
    .waitForFunction((selector) => !document.querySelector(selector), STREAMED_SEGMENT, {
      polling: 50,
      timeout: 5_000,
    })
    // A segment that never settles is not this helper's failure to report: the
    // assertion that follows will say what is actually wrong with the page.
    .catch(() => undefined)
}

const settled = new WeakSet<Page>()

/** Make this page's `goto` and `reload` wait for streamed content. Idempotent. */
function settleNavigations(page: Page): void {
  if (settled.has(page)) return
  settled.add(page)
  const goto = page.goto.bind(page)
  const reload = page.reload.bind(page)
  page.goto = async (...args: Parameters<Page['goto']>) => {
    const response = await goto(...args)
    await waitForStreamedContent(page)
    return response
  }
  page.reload = async (...args: Parameters<Page['reload']>) => {
    const response = await reload(...args)
    await waitForStreamedContent(page)
    return response
  }
}

function settleContext(context: BrowserContext): BrowserContext {
  context.pages().forEach(settleNavigations)
  context.on('page', settleNavigations)
  return context
}

// Covers the test's own `page`/`context` and every context a spec opens itself
// (`browser.newContext()` for a second user, `browser.newPage()`).
export const test = base.extend<object, object>({
  context: async ({ context }, use) => {
    await use(settleContext(context))
  },
  browser: [
    async ({ browser }, use) => {
      const newContext = browser.newContext.bind(browser)
      const newPage = browser.newPage.bind(browser)
      browser.newContext = async (...args: Parameters<Browser['newContext']>) =>
        settleContext(await newContext(...args))
      browser.newPage = async (...args: Parameters<Browser['newPage']>) => {
        const page = await newPage(...args)
        settleNavigations(page)
        return page
      }
      await use(browser)
    },
    { scope: 'worker' },
  ],
})
