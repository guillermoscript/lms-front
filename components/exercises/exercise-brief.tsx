'use client'

import { useTranslations } from 'next-intl'
import Markdown from 'react-markdown'

/**
 * What the student has to do. Shared by every exercise engine.
 *
 * Not a card: it is the reading on the page, and a bordered box with an
 * icon-and-uppercase header bar was chrome around a paragraph. The heading is
 * hidden on a phone, where the tab already says "Instructions".
 */
export default function ExerciseBrief({ instructions }: { instructions: string }) {
  const t = useTranslations('exercises.audio')

  return (
    <div>
      <h2 className="hidden lg:block mb-2 text-sm font-semibold">{t('instructions')}</h2>
      {/* 68ch: the brief is the longest prose on the page. */}
      <div className="prose prose-neutral max-w-[68ch] dark:prose-invert prose-p:leading-relaxed prose-p:text-foreground/85 prose-strong:text-foreground prose-headings:text-foreground prose-headings:font-semibold prose-li:text-foreground/85 prose-headings:text-base">
        <Markdown>{instructions}</Markdown>
      </div>
    </div>
  )
}
