import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

/**
 * When the school's AI refuses the analysis of an uploaded recording, the
 * recorder comes back empty: the only way on used to be a new recording, which
 * is a new row and a new daily attempt for nothing (#958). The AI notice now
 * carries the way back to the recording that is already there. Rendered
 * statically, so this pins what is offered, not what a press does.
 */

vi.mock('next-intl', () => ({
  useTranslations: (ns: string) => (key: string) => `${ns}.${key}`,
  useLocale: () => 'en',
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, refresh: () => {} }) }))
vi.mock('sonner', () => ({ toast: { success: () => {}, error: () => {} } }))

const { MediaTaskPanel } = await import('@/components/exercises/media-exercise-panels')

const QUOTA = { code: 'ai_quota', canConfigure: false, settingsUrl: null } as const

function render(props: Partial<Parameters<typeof MediaTaskPanel>[0]>) {
  return renderToStaticMarkup(
    createElement(MediaTaskPanel, {
      ns: 'exercises.audio',
      recorder: createElement('div', { 'data-testid': 'recorder' }),
      submitState: 'error',
      errorMsg: null,
      aiError: null,
      evaluation: null,
      passed: undefined,
      showRecorder: true,
      dailyLimitReached: false,
      maxDaily: 5,
      attemptsUsed: 1,
      minDuration: 5,
      maxDuration: 300,
      onRecordAgain: () => {},
      ...props,
    })
  )
}

const notice = (html: string) => html.match(/<div role="alert" data-testid="ai-error-notice"[\s\S]*?<\/div>/)?.[0] ?? ''

describe('MediaTaskPanel — a refused analysis', () => {
  it('offers analyzing the same recording again, inside the AI notice', () => {
    const html = render({ aiError: QUOTA, onRetryAnalysis: () => {} })
    expect(notice(html)).toContain('aiErrorNotice.student.ai_quota')
    expect(notice(html)).toMatch(/<button[^>]*>exercises\.audio\.retryAnalysis<\/button>/)
    // Recording a new take stays possible.
    expect(html).toContain('data-testid="recorder"')
  })

  it('has no such control when there is no recording to go back to', () => {
    // upload-url refused: nothing was uploaded, no row exists.
    const html = render({ aiError: QUOTA })
    expect(notice(html)).toContain('aiErrorNotice.student.ai_quota')
    expect(html).not.toContain('retryAnalysis')
  })

  it('names the control in the engine\'s own namespace', () => {
    const html = render({ ns: 'exercises.video', aiError: QUOTA, onRetryAnalysis: () => {} })
    expect(notice(html)).toContain('exercises.video.retryAnalysis')
  })
})
