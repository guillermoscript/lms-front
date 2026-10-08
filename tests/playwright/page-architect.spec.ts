/**
 * Page Architect in the landing-page editor, with the AI route mocked (no model, no key).
 *
 * The canned bodies below use the exact UI-message SSE format `/api/landing/chat` produces
 * (captured from a live gpt-4.1-mini run, docs/qa/page-architect): `start`, per tool call
 * `tool-input-start` → transient `data-page-op` → `tool-input-available` → `tool-output-available`,
 * then the text reply, `finish`, `[DONE]`.
 *
 * Two mocks:
 * - `page.route` fulfils the whole turn at once (a finished turn: undo/redo, layout).
 * - an in-page `fetch` stub streams the same chunks with delays, because `route.fulfill` cannot
 *   stream: it proves blocks land progressively and that Stop keeps the partial turn as ONE undo
 *   step.
 */
import { expect, test, type Page } from '@playwright/test'
import { loginAsAdmin } from './utils/auth'
import { LOCALE, TENANT_BASE } from './utils/constants'
import { CODE_ACADEMY_TENANT, getServiceRoleClient } from './utils/seed-state'

const ZONE = 'root:default-zone'
const RUN = Date.now().toString(36)
const TITLE = `[E2E] Page Architect ${RUN}`
const SLUG = `e2e-page-architect-${RUN}`
const SEED_ID = 'HeroBlock-e2eseed01'
const CHAT = '**/api/landing/chat'

let pageId: string | null = null

// ── Canned stream ──────────────────────────────────────────────────────────────────────

type Chunk = Record<string, unknown>

const ADDS = [
  { id: 'HeroBlock-e2eadd0001', type: 'HeroBlock', props: { title: 'Aprende Python desde cero', subtitle: 'Tu primer programa hoy.' } },
  { id: 'FaqAccordion-e2eadd02', type: 'FaqAccordion', props: { title: 'Preguntas frecuentes' } },
  { id: 'CtaBlock-e2eadd00003', type: 'CtaBlock', props: {} },
]

/** One add_block call, as the route streams it. */
function addBlockChunks(n: number, index: number): Chunk[] {
  const { id, type, props } = ADDS[n]
  const callId = `call_e2e_${n}`
  return [
    { type: 'start-step' },
    { type: 'tool-input-start', toolCallId: callId, toolName: 'add_block' },
    { type: 'data-page-op', data: { op: 'add', id, type, zone: ZONE, index, props }, transient: true },
    { type: 'tool-input-available', toolCallId: callId, toolName: 'add_block', input: { type, index, props } },
    { type: 'tool-output-available', toolCallId: callId, output: { ok: true, id } },
    { type: 'finish-step' },
  ]
}

/** A whole turn: three blocks after the seeded hero, then a short reply. */
function turnChunks(): Chunk[] {
  return [
    { type: 'start', messageId: `msg-e2e-${RUN}` },
    ...ADDS.flatMap((_, n) => addBlockChunks(n, n + 1)),
    { type: 'start-step' },
    { type: 'text-start', id: 'txt-1' },
    { type: 'text-delta', id: 'txt-1', delta: 'Añadí un hero, las preguntas frecuentes y una llamada a la acción.' },
    { type: 'text-end', id: 'txt-1' },
    { type: 'finish-step' },
    { type: 'finish', finishReason: 'stop' },
  ]
}

const sse = (chunks: Chunk[]) => chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n'

const SSE_HEADERS = {
  'content-type': 'text/event-stream',
  'cache-control': 'no-cache',
  'x-vercel-ai-ui-message-stream': 'v1',
}

/**
 * Streams `chunks` from inside the page, `delayMs` apart. With `hang`, the body never ends after
 * the last chunk: the turn stays open until the client aborts (Stop).
 */
async function installStreamingMock(page: Page, chunks: Chunk[], opts: { delayMs: number; hang?: boolean }) {
  const frames = chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`)
  if (!opts.hang) frames.push('data: [DONE]\n\n')
  await page.evaluate(
    ({ frames, delayMs, hang, headers }) => {
      const original = window.fetch.bind(window)
      window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
        if (!url.includes('/api/landing/chat')) return original(input, init)
        const signal = init?.signal
        const encoder = new TextEncoder()
        const body = new ReadableStream<Uint8Array>({
          async start(controller) {
            for (const frame of frames) {
              if (signal?.aborted) return
              controller.enqueue(encoder.encode(frame))
              await new Promise((r) => setTimeout(r, delayMs))
            }
            if (hang) {
              await new Promise<void>((resolve) => {
                if (signal?.aborted) resolve()
                else signal?.addEventListener('abort', () => resolve(), { once: true })
              })
              controller.error(new DOMException('The user aborted a request.', 'AbortError'))
              return
            }
            controller.close()
          },
        })
        return Promise.resolve(new Response(body, { status: 200, headers }))
      }
    },
    { frames, delayMs: opts.delayMs, hang: !!opts.hang, headers: SSE_HEADERS }
  )
}

// ── Editor helpers ─────────────────────────────────────────────────────────────────────

/** Top-level block ids on the canvas, in order. */
async function outline(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-puck-component]'))
      .filter((el) => !el.parentElement?.closest('[data-puck-component]'))
      .map((el) => el.getAttribute('data-puck-component') ?? '')
  )
}

async function openEditor(page: Page) {
  await loginAsAdmin(page)
  await page.goto(`${TENANT_BASE}/${LOCALE}/dashboard/admin/landing-page`, { waitUntil: 'domcontentloaded' })
  const row = page.locator('tr', { hasText: TITLE })
  await row.waitFor({ timeout: 60_000 })
  // A click before the list hydrates lands on server HTML and does nothing: press until the
  // editor (a dynamic import, slow on a cold dev server) opens.
  const panel = page.getByTestId('page-architect-panel')
  for (let attempt = 0; attempt < 6 && !(await panel.isVisible()); attempt++) {
    await row.evaluate((el) => (el as HTMLElement).click())
    await panel.waitFor({ timeout: 20_000 }).catch(() => undefined)
  }
  await expect(panel).toBeVisible()
  await expect.poll(() => outline(page), { timeout: 30_000 }).toEqual([SEED_ID])
}

async function ask(page: Page, text: string) {
  const input = page.getByTestId('page-architect-panel').getByRole('textbox')
  await input.fill(text)
  await input.press('Enter')
}

/** Puck's history hotkeys, with focus off the chat textarea. */
async function historyKey(page: Page, key: 'Control+z' | 'Control+Shift+z') {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await page.keyboard.press(key)
}

const turnIdle = (page: Page) => expect(page.getByTestId('page-architect-status')).toHaveCount(0, { timeout: 30_000 })

/**
 * The turn's single history entry exists (and history hotkeys are live again) once the panel
 * offers "N changes applied · Undo": the stream ending is not enough, the commit waits out
 * Puck's 250 ms history debounce first.
 */
const turnCommitted = (page: Page, count: number) =>
  expect(page.getByTestId('page-architect-panel')).toContainText(`${count} changes applied`, { timeout: 30_000 })

// ── Fixture ────────────────────────────────────────────────────────────────────────────

test.use({ viewport: { width: 1440, height: 900 } })
// Login + the editor's first compile on a dev server.
test.describe.configure({ timeout: 180_000 })

test.beforeAll(async () => {
  const admin = getServiceRoleClient()
  const { data, error } = await admin
    .from('landing_pages')
    .insert({
      tenant_id: CODE_ACADEMY_TENANT,
      title: TITLE,
      slug: SLUG,
      is_published: false,
      puck_data: {
        root: { props: {} },
        content: [{ type: 'HeroBlock', props: { id: SEED_ID, title: 'Seed hero', subtitle: 'Before the AI turn' } }],
        zones: {},
      },
    })
    .select('page_id')
    .single()
  if (error) throw error
  pageId = data.page_id
})

test.afterAll(async () => {
  if (pageId) await getServiceRoleClient().from('landing_pages').delete().eq('page_id', pageId)
})

// ── Specs ──────────────────────────────────────────────────────────────────────────────

test.describe('Page Architect (mocked /api/landing/chat)', () => {
  test('a turn adds its blocks; one Ctrl+Z restores the pre-turn page and redo brings the turn back', async ({ page }) => {
    let requestBody: Record<string, unknown> | null = null
    await page.route(CHAT, async (route) => {
      requestBody = route.request().postDataJSON()
      await route.fulfill({ status: 200, headers: SSE_HEADERS, body: sse(turnChunks()) })
    })
    await openEditor(page)

    await ask(page, 'Crea una landing para el curso Python for Beginners')
    const after = [SEED_ID, ...ADDS.map((a) => a.id)]
    await expect.poll(() => outline(page), { timeout: 30_000 }).toEqual(after)
    await turnIdle(page)
    await turnCommitted(page, 3)
    await expect(page.getByTestId('page-architect-panel')).toContainText('Añadí un hero')
    await expect(page.getByTestId('page-architect-panel').getByTestId('page-architect-tool-line')).toHaveCount(3)
    await expect(page.locator(`[data-puck-component="${ADDS[0].id}"]`)).toContainText('Aprende Python desde cero')

    // The editor sent its live page and no selection the admin never made.
    expect(requestBody).toMatchObject({ pageId, locale: LOCALE })
    expect((requestBody as unknown as { pageData: { content: unknown[] } }).pageData.content).toHaveLength(1)

    await historyKey(page, 'Control+z')
    await expect.poll(() => outline(page)).toEqual([SEED_ID])
    await historyKey(page, 'Control+Shift+z')
    await expect.poll(() => outline(page)).toEqual(after)
  })

  test('blocks land on the canvas progressively while the stream is still open', async ({ page }) => {
    await openEditor(page)
    await installStreamingMock(page, turnChunks(), { delayMs: 350 })

    const counts: number[] = []
    await ask(page, 'Crea una landing')
    const deadline = Date.now() + 20_000
    while (Date.now() < deadline) {
      const n = (await outline(page)).length
      if (counts.at(-1) !== n) counts.push(n)
      if (n === 4) break
      await page.waitForTimeout(100)
    }
    // Seen one block at a time: 1 → 2 → 3 → 4, never a jump from the empty turn to the end.
    expect(counts).toEqual([1, 2, 3, 4])
    await turnIdle(page)
  })

  test('Stop mid-turn keeps the partial result as ONE undo step', async ({ page }) => {
    await openEditor(page)
    // Two blocks, then the stream hangs until the admin presses Stop.
    const partial = [{ type: 'start', messageId: `msg-e2e-stop-${RUN}` }, ...addBlockChunks(0, 1), ...addBlockChunks(1, 2)]
    await installStreamingMock(page, partial, { delayMs: 150, hang: true })

    await ask(page, 'Crea una landing')
    const twoAdded = [SEED_ID, ADDS[0].id, ADDS[1].id]
    await expect.poll(() => outline(page), { timeout: 20_000 }).toEqual(twoAdded)
    await expect(page.getByTestId('page-architect-status')).toBeVisible()

    const stop = page.getByTestId('page-architect-panel').getByRole('button', { name: 'Stop' })
    await stop.evaluate((el) => (el as HTMLElement).click())
    await turnIdle(page)
    await turnCommitted(page, 2)
    await expect.poll(() => outline(page)).toEqual(twoAdded)

    await historyKey(page, 'Control+z')
    await expect.poll(() => outline(page)).toEqual([SEED_ID])
    await historyKey(page, 'Control+Shift+z')
    await expect.poll(() => outline(page)).toEqual(twoAdded)
  })

  for (const width of [1280, 1440]) {
    test(`the docked panel never covers the canvas at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.route(CHAT, (route) => route.fulfill({ status: 200, headers: SSE_HEADERS, body: sse(turnChunks()) }))
      await openEditor(page)
      await ask(page, 'Crea una landing')
      await expect.poll(() => outline(page), { timeout: 30_000 }).toHaveLength(4)
      await turnIdle(page)

      const panel = await page.getByTestId('page-architect-panel').boundingBox()
      const canvas = await page.locator('[class*="_PuckCanvas_"]').first().boundingBox()
      const fields = await page.locator('[class*="_PuckLayout-inner_"] > :last-child').first().boundingBox()
      expect(panel && canvas && fields).toBeTruthy()
      // Side by side, no overlap: the canvas (and Puck's fields column) end where the panel starts.
      expect(canvas!.x + canvas!.width).toBeLessThanOrEqual(panel!.x + 1)
      expect(fields!.x + fields!.width).toBeLessThanOrEqual(panel!.x + 1)
      // …and the canvas keeps a usable width beside it.
      expect(canvas!.width).toBeGreaterThanOrEqual(320)
      // The panel is full height and stays in view (the canvas scrolls, not the editor).
      expect(panel!.y).toBeGreaterThanOrEqual(0)
      expect(panel!.height).toBeGreaterThan(600)
    })
  }
})
