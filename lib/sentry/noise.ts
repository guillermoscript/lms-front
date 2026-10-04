/**
 * Sentry noise filters — the errors we deliberately do NOT store, and why.
 *
 * Every drop rule here is a liability: an over-broad one hides a real crash and
 * nobody finds out until a user complains. So each predicate is written as
 * narrowly as the evidence allows, is a pure function over the event (no
 * globals, no SDK types), and is pinned by `tests/unit/sentry-noise.test.ts`.
 * Prefer adding a rule here over an `ignoreErrors` entry in the Sentry config:
 * `ignoreErrors` matches a substring of the message and nothing else, which is
 * exactly the blunt instrument we want to avoid for these two cases.
 *
 * Imported by BOTH `sentry.server.config.ts` and `instrumentation-client.ts`.
 * Keep it free of browser-only and node-only APIs: the `Document` it inspects
 * is passed in by the caller.
 */

/**
 * The only fields these predicates read. Structural rather than
 * `@sentry/nextjs`'s `ErrorEvent` so the unit tests can build a literal and the
 * module never drags the SDK into a node test environment.
 */
export interface SentryNoiseEvent {
  exception?: {
    values?: Array<{ type?: string; value?: string }>
  }
}

function firstException(event: SentryNoiseEvent): { type?: string; value?: string } | undefined {
  return event.exception?.values?.[0]
}

/* -------------------------------------------------------------------------- */
/* LMS-FRONT-82 — "Failed to find Server Action"                              */
/* -------------------------------------------------------------------------- */

/**
 * Next.js throws this (error code `E975`) from
 * `server/app-render/action-handler.ts` on exactly one path: a POST whose
 * content type is `multipart/form-data`, carrying no `next-action` header and
 * no resolvable `$ACTION_ID_` field. Two things reach it, neither of them a bug
 * in our code:
 *
 * - a client running a superseded bundle submitting a progressive-enhancement
 *   form (`<form action={serverAction}>`) across a deploy boundary, which
 *   `deploymentId` in `next.config.ts` now turns into a hard navigation; and
 * - any third party POSTing a form body at a page URL — `/auth/login` renders
 *   no Server Action at all, yet it is where this fires in production, which is
 *   what scanner traffic looks like.
 *
 * Next itself treats the equivalent fetch-action case as a `console.warn` and a
 * 404 (`handleUnrecognizedFetchAction`); only the MPA path throws. We mirror
 * that judgement instead of paging on traffic we do not control.
 */
export function isServerActionNotFoundError(event: SentryNoiseEvent): boolean {
  const value = firstException(event)?.value ?? ''
  return value.includes('Failed to find Server Action')
}

/* -------------------------------------------------------------------------- */
/* LMS-FRONT-9M — NotFoundError: Failed to execute 'removeChild' on 'Node'    */
/* -------------------------------------------------------------------------- */

const DOM_RECONCILIATION_ERROR =
  /Failed to execute '(?:removeChild|insertBefore|appendChild)' on 'Node'/

/** The error shape React produces when the DOM moved under it. */
function isDomReconciliationError(event: SentryNoiseEvent): boolean {
  const exception = firstException(event)
  if (exception?.type !== 'NotFoundError') return false
  return DOM_RECONCILIATION_ERROR.test(exception.value ?? '')
}

/**
 * Markers left in the document by the page translators that cause this. They
 * rewrite React-owned text nodes into `<font>` wrappers, so React's next
 * `removeChild` names a node that is no longer a child of the parent it
 * remembers. Nothing we can fix from inside the app.
 */
const TRANSLATOR_MARKERS: Array<{ by: string; selector: string }> = [
  // Google Translate: the widget stamps the direction class on <html> and
  // injects its tooltip host into the body.
  { by: 'google-translate', selector: 'html.translated-ltr, html.translated-rtl' },
  { by: 'google-translate', selector: '#goog-gt-tt, .goog-te-banner-frame, .skiptranslate' },
  // Microsoft Translator (Edge's built-in): hashes every text node it replaces.
  { by: 'microsoft-translator', selector: 'font[_msttexthash], [_msthash]' },
]

export type DomNoiseVerdict =
  /** Not this class of error — the caller should not change anything. */
  | { kind: 'not-applicable' }
  /** React-vs-translator. Drop it; `mutatedBy` says which one. */
  | { kind: 'drop'; mutatedBy: string }
  /**
   * The error shape matches but no third-party marker is present, so this may
   * be a genuine reconciliation bug of ours. Keep it, tagged, so it is
   * separable from the noise in the Sentry UI.
   */
  | { kind: 'keep' }

/**
 * Decide what to do with a `removeChild`/`insertBefore` `NotFoundError`.
 *
 * `doc` is the live document, or `null` where there is none (server, prerender)
 * — with no document we cannot prove a translator was involved, so the event is
 * kept rather than dropped.
 */
export function classifyDomMutationError(
  event: SentryNoiseEvent,
  doc: Document | null
): DomNoiseVerdict {
  if (!isDomReconciliationError(event)) return { kind: 'not-applicable' }
  if (!doc) return { kind: 'keep' }

  for (const marker of TRANSLATOR_MARKERS) {
    try {
      if (doc.querySelector(marker.selector)) return { kind: 'drop', mutatedBy: marker.by }
    } catch {
      // A malformed selector must never cost us the event.
    }
  }

  return { kind: 'keep' }
}
