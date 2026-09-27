import { describe, it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

/**
 * The course welcome offer (#868) posts its pre-filled prompt in ONE click: the
 * first render must already show the text and the "Post and pin" button, not
 * hide them behind an expand step. Rendered statically, so this pins the
 * initial state only; the E2E in community.spec.ts presses the buttons.
 */

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => `welcome.${key}` }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, refresh: () => {} }) }))
vi.mock('sonner', () => ({ toast: { success: () => {}, error: () => {} } }))
vi.mock('@/app/actions/community', () => ({ createPost: async () => ({ success: true }) }))
vi.mock('@/app/actions/ui-state', () => ({ setUiState: async () => ({ success: true }) }))

const { CourseWelcomePrompt } = await import('@/components/community/course-welcome-prompt')

const html = renderToStaticMarkup(
  createElement(CourseWelcomePrompt, {
    courseId: 7,
    dismissKey: 'community-welcome-7',
    defaultTitle: 'Introduce yourself',
    defaultContent: 'Welcome to Algebra. Tell us who you are.',
  })
)

describe('CourseWelcomePrompt — first render', () => {
  it('shows the pre-filled title and message', () => {
    const preview = html.slice(html.indexOf('data-testid="course-welcome-preview"'))
    expect(preview).toContain('Introduce yourself')
    expect(preview).toContain('Welcome to Algebra. Tell us who you are.')
  })

  it('offers posting it as is, editing it first, or not now', () => {
    const buttons = [...html.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map(([, label]) => label)
    expect(buttons).toEqual(['welcome.submit', 'welcome.edit', 'welcome.dismiss'])
  })

  it('keeps the fields closed until "Edit"', () => {
    expect(html).not.toContain('<input')
    expect(html).not.toContain('<textarea')
  })
})
