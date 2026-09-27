import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import en from '../../messages/en.json'
import es from '../../messages/es.json'
import { readMilestone } from '@/lib/community/milestones'
import { MilestoneCard } from '@/components/community/milestone-card'

/**
 * Milestone posts are written by the database with empty `content` (#871);
 * the card renders the sentence from `milestone_type` + `milestone_data`.
 * The old card passed empty `course` / `level` / `days` to its strings, so a
 * completion read "completed the course !" — these pin the real values, both
 * languages, and a plain fallback (never "undefined" or an empty bold) when
 * the data is malformed.
 */

describe('readMilestone', () => {
  it('reads each type from its milestone_data contract', () => {
    expect(readMilestone('course_completion', { course_id: 7, course_title: 'Intro to Python' })).toEqual({
      kind: 'course_completion',
      course: 'Intro to Python',
      certificate: false,
    })
    expect(readMilestone('course_completion', { course_title: 'Intro', certificate: true })).toMatchObject({
      certificate: true,
    })
    expect(readMilestone('certificate', { course_title: ' SQL ' })).toEqual({ kind: 'certificate', course: 'SQL' })
    expect(readMilestone('level_up', { level: 5 })).toEqual({ kind: 'level_up', level: 5 })
    expect(readMilestone('streak', { days: 30 })).toEqual({ kind: 'streak', days: 30 })
  })

  it('turns malformed data into missing values, not garbage', () => {
    expect(readMilestone('course_completion', null)).toEqual({ kind: 'course_completion', course: null, certificate: false })
    expect(readMilestone('course_completion', { course_title: '   ', certificate: 'true' })).toEqual({
      kind: 'course_completion',
      course: null,
      certificate: false,
    })
    expect(readMilestone('certificate', ['Intro'])).toEqual({ kind: 'certificate', course: null })
    expect(readMilestone('level_up', { level: '5' })).toEqual({ kind: 'level_up', level: null })
    expect(readMilestone('level_up', { level: 0 })).toEqual({ kind: 'level_up', level: null })
    expect(readMilestone('streak', { days: 7.5 })).toEqual({ kind: 'streak', days: null })
    expect(readMilestone('badge', { anything: 1 })).toEqual({ kind: 'unknown' })
    expect(readMilestone(null, {})).toEqual({ kind: 'unknown' })
  })
})

function render(locale: 'en' | 'es', milestone_type: string | null, milestone_data: unknown): string {
  const html = renderToStaticMarkup(
    createElement(NextIntlClientProvider, {
      locale,
      messages: locale === 'en' ? en : es,
      timeZone: 'UTC',
      children: createElement(MilestoneCard, { post: { milestone_type, milestone_data } }),
    })
  )
  expect(html).not.toContain('undefined')
  expect(html).not.toMatch(/<strong[^>]*><\/strong>/)
  return html
}

/** The visible sentence, tags stripped. */
function sentence(html: string): string {
  return html.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, '').trim()
}

describe('MilestoneCard', () => {
  it('names the real course, in English and Spanish', () => {
    const html = render('en', 'course_completion', { course_id: 7, course_title: 'Intro to Python' })
    expect(sentence(html)).toBe('Completed Intro to Python')
    expect(html).toContain('<strong class="font-semibold text-foreground">Intro to Python</strong>')
    expect(html).toContain('data-milestone-type="course_completion"')
    expect(sentence(render('es', 'course_completion', { course_title: 'Intro to Python' }))).toBe('Completó Intro to Python')
  })

  it('says both when the certificate was folded into the completion', () => {
    const data = { course_title: 'Intro to Python', certificate: true }
    expect(sentence(render('en', 'course_completion', data))).toBe('Completed Intro to Python and earned the certificate')
    expect(sentence(render('es', 'course_completion', data))).toBe('Completó Intro to Python y obtuvo el certificado')
  })

  it('renders a separate certificate post', () => {
    expect(sentence(render('en', 'certificate', { course_title: 'SQL' }))).toBe('Earned the certificate for SQL')
    expect(sentence(render('es', 'certificate', { course_title: 'SQL' }))).toBe('Obtuvo el certificado de SQL')
  })

  it('shows the level and the streak length', () => {
    expect(sentence(render('en', 'level_up', { level: 5 }))).toBe('Reached level 5')
    expect(sentence(render('es', 'level_up', { level: 5 }))).toBe('Alcanzó el nivel 5')
    expect(sentence(render('en', 'streak', { days: 30 }))).toBe('Reached a 30-day streak')
    expect(sentence(render('es', 'streak', { days: 30 }))).toBe('Alcanzó una racha de 30 días')
  })

  it('falls back to a plain sentence when a value is missing', () => {
    expect(sentence(render('en', 'course_completion', {}))).toBe('Completed a course')
    expect(sentence(render('es', 'certificate', null))).toBe('Obtuvo un certificado')
    expect(sentence(render('en', 'level_up', { level: 'five' }))).toBe('Reached a milestone')
    expect(sentence(render('en', 'streak', {}))).toBe('Reached a milestone')
    expect(sentence(render('es', 'something_new', {}))).toBe('Alcanzó un logro')
  })

  it('keeps system copy calm — no exclamation marks', () => {
    const strings = [en.community.milestones, es.community.milestones].flatMap((group) =>
      Object.values(group).flatMap((value) => (typeof value === 'string' ? [value] : Object.values(value)))
    )
    for (const value of strings) expect(value).not.toMatch(/[!¡]/)
  })

  it('never repeats the author name — PostCard already shows it', () => {
    const html = render('en', 'course_completion', { course_title: 'Intro to Python' })
    expect(html).not.toContain('{name}')
    expect(Object.values(en.community.milestones).join(' ')).not.toContain('{name}')
  })
})
