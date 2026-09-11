import { describe, expect, it } from 'vitest'
import {
  classifyDomMutationError,
  isServerActionNotFoundError,
  type SentryNoiseEvent,
} from '@/lib/sentry/noise'
import { resolveDeploymentId } from '@/lib/build/deployment-id'

function errorEvent(type: string, value: string): SentryNoiseEvent {
  return { exception: { values: [{ type, value }] } }
}

/**
 * Minimal stand-in for `document` — the predicate only ever calls
 * `querySelector`, and the vitest environment is `node`, so there is no real
 * DOM to build. The stub answers for an explicit list of selectors it should
 * match, which is also the readable way to say "this marker was present".
 */
function documentWithMarkers(matching: string[]): Document {
  return {
    querySelector(selector: string) {
      return matching.includes(selector) ? ({} as Element) : null
    },
  } as unknown as Document
}

describe('isServerActionNotFoundError (LMS-FRONT-82)', () => {
  it('matches the error Next throws for an unresolvable action id', () => {
    const event = errorEvent(
      'Error',
      'Failed to find Server Action "7f3a1c". This request might be from an older or newer deployment.\n' +
        'Read more: https://nextjs.org/docs/messages/failed-to-find-server-action'
    )
    expect(isServerActionNotFoundError(event)).toBe(true)
  })

  it('matches the id-less variant thrown from the MPA form path', () => {
    // The `areAllActionIdsValid` branch has no id to interpolate — this is the
    // exact string a form-shaped POST with no action field produces.
    const event = errorEvent(
      'Error',
      'Failed to find Server Action. This request might be from an older or newer deployment.'
    )
    expect(isServerActionNotFoundError(event)).toBe(true)
  })

  it('leaves every other server error alone', () => {
    expect(isServerActionNotFoundError(errorEvent('TypeError', 'x is not a function'))).toBe(false)
    expect(
      isServerActionNotFoundError(errorEvent('Error', 'permission denied for table transactions'))
    ).toBe(false)
    // A Server Action that ran and threw must always be reported.
    expect(
      isServerActionNotFoundError(errorEvent('Error', 'Server Action failed: enroll_user'))
    ).toBe(false)
    expect(isServerActionNotFoundError({})).toBe(false)
  })
})

describe('classifyDomMutationError (LMS-FRONT-9M)', () => {
  const removeChild = errorEvent(
    'NotFoundError',
    "Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of this node."
  )

  it('drops the error when Google Translate has rewritten the page', () => {
    const verdict = classifyDomMutationError(
      removeChild,
      documentWithMarkers(['html.translated-ltr, html.translated-rtl'])
    )
    expect(verdict).toEqual({ kind: 'drop', mutatedBy: 'google-translate' })
  })

  it('drops the error when Microsoft Translator has rewritten the page', () => {
    const verdict = classifyDomMutationError(
      removeChild,
      documentWithMarkers(['font[_msttexthash], [_msthash]'])
    )
    expect(verdict).toEqual({ kind: 'drop', mutatedBy: 'microsoft-translator' })
  })

  it('KEEPS the same error when no translator marker is present', () => {
    // The whole point of the narrow predicate: an unexplained removeChild is a
    // candidate React bug and must still reach us.
    expect(classifyDomMutationError(removeChild, documentWithMarkers([]))).toEqual({ kind: 'keep' })
  })

  it('keeps the error when there is no document to inspect', () => {
    expect(classifyDomMutationError(removeChild, null)).toEqual({ kind: 'keep' })
  })

  it('covers insertBefore, which fails the same way', () => {
    const insertBefore = errorEvent(
      'NotFoundError',
      "Failed to execute 'insertBefore' on 'Node': The node before which the new node is to be inserted is not a child of this node."
    )
    expect(
      classifyDomMutationError(insertBefore, documentWithMarkers(['#goog-gt-tt, .goog-te-banner-frame, .skiptranslate']))
    ).toEqual({ kind: 'drop', mutatedBy: 'google-translate' })
  })

  it('ignores unrelated errors even on a translated page', () => {
    const translated = documentWithMarkers(['html.translated-ltr, html.translated-rtl'])
    expect(classifyDomMutationError(errorEvent('TypeError', 'undefined is not an object'), translated)).toEqual({
      kind: 'not-applicable',
    })
    // Same message shape, different error type — not React's DOM race.
    expect(
      classifyDomMutationError(errorEvent('Error', "Failed to execute 'removeChild' on 'Node'"), translated)
    ).toEqual({ kind: 'not-applicable' })
    expect(classifyDomMutationError({}, translated)).toEqual({ kind: 'not-applicable' })
  })
})

describe('resolveDeploymentId (LMS-FRONT-82)', () => {
  it('uses the build SHA the deploy workflow passes in', () => {
    expect(resolveDeploymentId({ SENTRY_RELEASE: 'ffd76563' })).toBe('ffd76563')
  })

  it('lets NEXT_DEPLOYMENT_ID override it', () => {
    expect(
      resolveDeploymentId({ NEXT_DEPLOYMENT_ID: 'manual-1', SENTRY_RELEASE: 'ffd76563' })
    ).toBe('manual-1')
  })

  it('is undefined when unset or blank, so local builds are unchanged', () => {
    expect(resolveDeploymentId({})).toBeUndefined()
    expect(resolveDeploymentId({ SENTRY_RELEASE: '' })).toBeUndefined()
    expect(resolveDeploymentId({ SENTRY_RELEASE: '   ' })).toBeUndefined()
  })
})
