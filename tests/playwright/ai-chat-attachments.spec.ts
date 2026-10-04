import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, type Page, type Request } from '@playwright/test'
import { loginAsTenantStudent } from './utils/auth'
import { TENANT_BASE, LOCALE } from './utils/constants'
import { noisePng, tinyPdf } from './utils/images'

/**
 * Image attachments in the AI chats (#633).
 *
 * The feature shipped once already looking green — typecheck, unit tests and CI
 * all passed while real uploads were broken, because every bug lived in the
 * browser: the picker refused ordinary phone photos (its ceiling ran BEFORE
 * downscaling) and formats the routes do not forward vanished server-side with
 * no error. So these tests deliberately assert on what actually leaves the
 * browser — the POST body — rather than on whether the call succeeded.
 *
 * Requires the exercise seed from `supabase db reset` (Code Academy, exercise
 * 2004) and a dev server; there is no `webServer` in the Playwright config.
 *
 * Each test opens a real model stream, which a dev server takes a while to let
 * go of. Run these back to back without a pause and the next sign-in queues
 * behind the last run's streams and never lands — give it a couple of minutes
 * between runs, or expect a login failure that has nothing to do with login.
 */

/** Mirrors the server's own `approxDataUrlBytes`. */
const dataUrlBytes = (url: string): number => {
    const comma = url.indexOf(',')
    return comma === -1 ? 0 : Math.floor(((url.length - comma - 1) * 3) / 4)
}

const WIRE_LIMIT_BYTES = 5 * 1024 * 1024
const PICKER_LIMIT_BYTES = 25 * 1024 * 1024
const EXERCISE_URL = `${TENANT_BASE}/${LOCALE}/dashboard/student/courses/2001/exercises/2004`

/**
 * One sign-in for the whole file. Four password grants in a row is enough for
 * GoTrue to start rate-limiting them, which shows up as a login that simply
 * never redirects — so the session is captured once and replayed.
 */
const AUTH_STATE = join(tmpdir(), 'lms-ai-chat-attachments-auth.json')
test.use({ storageState: AUTH_STATE })

interface FilePart {
    type: string
    url: string
    mediaType?: string
    filename?: string
}

/**
 * Sonner unmounts toasts on a timer, so poll-and-read races them. Record every
 * distinct toast that ever appears instead. Never clear the toast nodes by
 * hand — removing them out from under Sonner leaves its store thinking they are
 * still mounted and later toasts silently never render.
 */
async function collectToasts(page: Page) {
    await page.evaluate(() => {
        const seen = new Set<string>()
        const w = window as unknown as { __toasts: string[] }
        w.__toasts = []
        new MutationObserver(() => {
            document.querySelectorAll('[data-sonner-toast]').forEach((el) => {
                const text = (el as HTMLElement).innerText.trim()
                if (text && !seen.has(text)) {
                    seen.add(text)
                    w.__toasts.push(text)
                }
            })
        }).observe(document.body, { childList: true, subtree: true, characterData: true })
    })
}

const toasts = (page: Page) =>
    page.evaluate(() => (window as unknown as { __toasts: string[] }).__toasts.slice())

/** File parts of the last user message in the most recent chat POST. */
function chatPoster(page: Page) {
    const bodies: string[] = []
    page.on('request', (req: Request) => {
        if (req.method() === 'POST' && req.url().includes('/api/chat/exercises/student')) {
            bodies.push(req.postData() ?? '')
        }
    })
    return {
        count: () => bodies.length,
        async lastFileParts(): Promise<FilePart[]> {
            const body = bodies[bodies.length - 1]
            if (!body) return []
            const parsed = JSON.parse(body) as { messages: { parts?: FilePart[] }[] }
            const last = parsed.messages[parsed.messages.length - 1]
            return (last.parts ?? []).filter((p) => p.type === 'file')
        },
    }
}

/**
 * Wait until React owns the composer, not just until it is painted.
 *
 * Everything here is driven through the chat's own handlers, and a server-
 * rendered composer has none attached yet: a file set on the input fires a
 * change event nobody listens to, so no chip appears, no toast fires and no
 * request is ever made. The composer's textarea is controlled, so a value that
 * survives a round trip proves hydration has happened.
 */
async function waitForChatHydration(page: Page) {
    const composer = page.getByPlaceholder('Type your response...')
    await expect(composer).toBeVisible({ timeout: 30_000 })
    await expect
        .poll(
            async () => {
                await composer.fill('.')
                return composer.inputValue()
            },
            { timeout: 30_000, intervals: [250, 500, 1000] }
        )
        .toBe('.')
    await composer.fill('')
}

/**
 * Land on the exercise chat and stay there.
 *
 * Logging in leaves a client-side navigation queued, so the app can replace the
 * whole document moments after the composer first hydrates — taking the file
 * input and the toast observer with it, and leaving `setInputFiles` to fire at
 * an element no longer on the page. Probe, install, then confirm the observer
 * survived a beat; if a navigation ate it, do it again.
 */
async function openExerciseChat(page: Page) {
    await page.goto(EXERCISE_URL, { waitUntil: 'domcontentloaded' })

    for (let attempt = 0; attempt < 5; attempt++) {
        await waitForChatHydration(page)
        await collectToasts(page)
        await page.waitForTimeout(1500)
        const survived = await page.evaluate(() =>
            Array.isArray((window as unknown as { __toasts?: string[] }).__toasts)
        )
        if (survived) return
    }
    throw new Error('The exercise chat never stopped re-navigating')
}

/**
 * Fixtures are written to disk rather than handed over as buffers: Chromium
 * applies the input's own `accept` filter to in-memory payloads and drops
 * non-matching ones before any event fires, which would silently skip the very
 * rejection path these tests exist to check.
 */
let fixtureDir: string
const fixture = (name: string, bytes: Buffer): string => {
    const path = join(fixtureDir, name)
    writeFileSync(path, bytes)
    return path
}

const attach = (page: Page, paths: string[]) =>
    page.locator('input[type=file]').first().setInputFiles(paths)

async function send(page: Page, text: string) {
    await page.getByPlaceholder('Type your response...').fill(text)
    await page.getByRole('button', { name: 'Submit' }).first().click()
}

test.describe('AI chat image attachments', () => {
    test.beforeAll(async ({ browser }) => {
        // Hooks inherit the file's per-test timeout, which is far too short for
        // a sign-in that may also be paying for a cold dev-server compile.
        test.setTimeout(120_000)
        fixtureDir = mkdtempSync(join(tmpdir(), 'lms-attachments-'))

        // A dev server with no warm cache occasionally strands the post-login
        // navigation altogether. One sign-in gates the whole file, so give it a
        // second chance rather than reporting four attachment failures for it.
        for (let attempt = 1; attempt <= 2; attempt++) {
            const context = await browser.newContext({ storageState: undefined })
            try {
                await loginAsTenantStudent(await context.newPage())
                await context.storageState({ path: AUTH_STATE })
                return
            } catch (error) {
                if (attempt === 2) throw error
            } finally {
                await context.close()
            }
        }
    })
    test.afterAll(() => {
        rmSync(fixtureDir, { recursive: true, force: true })
        rmSync(AUTH_STATE, { force: true })
    })

    test('an ordinary phone-sized photo is accepted and downscaled onto the wire', async ({ page }) => {
        // Generating and re-encoding ~14 MB of pixels in the page is slow by nature.
        test.setTimeout(180_000)
        const posts = chatPoster(page)
        await openExerciseChat(page)

        // 2200px square of noise ≈ 14 MB — the size of a real camera photo, and
        // the exact case the first cut of this feature rejected outright.
        const oversized = noisePng(2200)
        expect(oversized.byteLength).toBeGreaterThan(WIRE_LIMIT_BYTES)
        expect(oversized.byteLength).toBeLessThan(PICKER_LIMIT_BYTES)

        await attach(page, [fixture('camera-photo.png', oversized)])
        // The picker must stage it rather than turn it away: its ceiling is the
        // pre-downscale one, and nothing about this file is a user error.
        await expect(page.locator('[data-sonner-toast]')).toHaveCount(0)
        await send(page, 'What do you see in this image?')

        await expect.poll(() => posts.count(), { timeout: 90_000 }).toBeGreaterThan(0)
        const parts = await posts.lastFileParts()
        expect(parts).toHaveLength(1)
        expect(parts[0].mediaType).toBe('image/jpeg') // transcoded on the way down
        expect(dataUrlBytes(parts[0].url)).toBeGreaterThan(0)
        expect(dataUrlBytes(parts[0].url)).toBeLessThanOrEqual(WIRE_LIMIT_BYTES)

        // And the student can see what they sent.
        const sentImage = page.locator('img[src^="data:image/"]').first()
        await expect(sentImage).toBeVisible({ timeout: 30_000 })
        expect(await sentImage.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0)
    })

    test('a small image in a supported format travels untouched', async ({ page }) => {
        test.setTimeout(120_000)
        const posts = chatPoster(page)
        await openExerciseChat(page)

        // Under the re-encode threshold and under the max edge: re-encoding it
        // would only cost quality, so it must stay a PNG.
        const small = noisePng(300)
        expect(small.byteLength).toBeLessThan(512 * 1024)

        await attach(page, [fixture('screenshot.png', small)])
        await send(page, 'And this one?')

        await expect.poll(() => posts.count(), { timeout: 90_000 }).toBeGreaterThan(0)
        const parts = await posts.lastFileParts()
        expect(parts).toHaveLength(1)
        expect(parts[0].mediaType).toBe('image/png')
        expect(parts[0].filename).toBe('screenshot.png')
    })

    test('files the chat cannot use are refused out loud, never silently', async ({ page }) => {
        test.setTimeout(180_000)
        const posts = chatPoster(page)
        await openExerciseChat(page)

        // 1. Not an image at all — refused by the picker's accept filter.
        await attach(page, [fixture('notes.pdf', tinyPdf())])
        await expect.poll(() => toasts(page), { timeout: 15_000 }).toContain(
            'Only images can be attached.'
        )

        // 2. An image, but past the pre-downscale ceiling nothing can rescue.
        const huge = noisePng(3000)
        expect(huge.byteLength).toBeGreaterThan(PICKER_LIMIT_BYTES)
        await attach(page, [fixture('enormous.png', huge)])
        await expect.poll(() => toasts(page), { timeout: 30_000 }).toContain(
            'Each image must be under 25 MB.'
        )

        expect(posts.count()).toBe(0) // neither was ever sent

        // 3. A format the browser cannot decode — an iPhone HEIC in Chrome, which
        // has no HEIC decoder at all. It clears the picker's `image/*` filter and
        // then fails to transcode, so the student must be told; the old bug was
        // that it disappeared server-side with no message and no image.
        await attach(page, [fixture('IMG_0042.heic', Buffer.from('not really a heic'))])
        await send(page, 'Can you read this photo?')

        await expect.poll(() => toasts(page), { timeout: 30_000 }).toContain(
            'IMG_0042.heic could not be read as an image, so it was not sent.'
        )
        // The turn still goes through — the text is not lost with the image.
        await expect.poll(() => posts.count(), { timeout: 60_000 }).toBe(1)
        expect(await posts.lastFileParts()).toHaveLength(0)
    })

    test('sent images come back after a reload, via signed URLs', async ({ page }) => {
        test.setTimeout(180_000)
        const posts = chatPoster(page)
        await openExerciseChat(page)

        await attach(page, [fixture('reload-me.png', noisePng(1800))])
        await send(page, 'Remember this image.')
        await expect.poll(() => posts.count(), { timeout: 90_000 }).toBeGreaterThan(0)
        await expect(page.locator('img[src^="data:image/"]').first()).toBeVisible({ timeout: 30_000 })

        await page.goto(EXERCISE_URL, { waitUntil: 'domcontentloaded' })
        // The bucket is private, so history can only render through a signed URL.
        const restored = page.locator('img[src*="ai-chat-attachments"]').first()
        await expect(restored).toBeVisible({ timeout: 45_000 })
        expect(await restored.getAttribute('src')).toContain('/object/sign/')
        await expect
            .poll(() => restored.evaluate((el: HTMLImageElement) => el.naturalWidth), { timeout: 20_000 })
            .toBeGreaterThan(0)
    })
})
