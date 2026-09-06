/**
 * Session replay configuration for the browser tracker.
 *
 * OpenPanel's recorder (rrweb, ~185 KB, code-split) only loads when
 * `sessionReplay.enabled` is true and the session wins the sample roll, so
 * this is the one switch that decides whether a visit produces a video.
 *
 * ENV: `NEXT_PUBLIC_OPENPANEL_REPLAY_SAMPLE_RATE`
 *   unset / blank → 1  (record every session — right call while the whole
 *                       user base fits on one screen, see §13 of the doc)
 *   0 or `off`    → replay disabled, recorder never downloaded
 *   0 < n ≤ 1     → that fraction of sessions
 *
 * Read literally (`process.env.NEXT_PUBLIC_…`) because Next inlines it at
 * build time; a computed lookup would be `undefined` in the browser bundle.
 * It is a build arg, so it also lives in the Dockerfile and deploy.yml.
 */

/**
 * Selector for anything that must never appear in a recording. Add
 * `data-analytics-block` to a payment form, a token field, a private note.
 * The element is rendered as an empty box of the same size.
 */
export const REPLAY_BLOCK_SELECTOR = '[data-analytics-block]'

/**
 * Served by `app/api/op/[...path]/route.ts` from the same origin as `op1.js`,
 * so the recorder is as adblock-resistant as the tracker itself.
 */
export const REPLAY_SCRIPT_PATH = '/api/op/op1-replay.js'

export type SessionReplayConfig = {
  enabled: boolean
  sampleRate: number
  maskAllInputs: boolean
  maskAllText: boolean
  blockSelector: string
  scriptUrl: string
}

export function parseReplaySampleRate(raw: string | undefined): number {
  const value = (raw ?? '').trim().toLowerCase()
  if (value === '') return 1
  if (value === 'off' || value === 'false' || value === 'no') return 0
  const n = Number(value)
  if (!Number.isFinite(n)) return 1
  return Math.min(1, Math.max(0, n))
}

export function getSessionReplayConfig(): SessionReplayConfig {
  const sampleRate = parseReplaySampleRate(
    process.env.NEXT_PUBLIC_OPENPANEL_REPLAY_SAMPLE_RATE
  )
  return {
    enabled: sampleRate > 0,
    sampleRate,
    // Every <input>/<textarea> value is masked — passwords, card fields on
    // our own forms, search boxes. Stripe Elements live in cross-origin
    // iframes, which rrweb cannot see into regardless.
    maskAllInputs: true,
    // The vendor default masks ALL page text, which turns a journey into a
    // wall of asterisks. We want to watch where people get stuck, so page
    // text stays; opt sensitive blocks out with REPLAY_BLOCK_SELECTOR.
    maskAllText: false,
    blockSelector: REPLAY_BLOCK_SELECTOR,
    scriptUrl: REPLAY_SCRIPT_PATH,
  }
}
