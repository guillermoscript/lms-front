'use client'

import { useTranslations } from 'next-intl'
import Markdown from 'react-markdown'
import { IconInfoCircle } from '@tabler/icons-react'

/**
 * What the student has to do. One card, shared by every exercise engine —
 * each used to carry its own near-identical copy.
 *
 * The heading is `foreground`, not `text-primary`: tenants override that token,
 * so 10px uppercase text in it cannot be guaranteed to clear AA. The icon keeps
 * the accent, since non-text UI only needs 3:1.
 */
export default function ExerciseBrief({ instructions }: { instructions: string }) {
  const t = useTranslations('exercises.audio')

  return (
    // No card on a phone: the panel already *is* the instructions, so a border
    // and a header repeating the tab label are chrome around nothing. From `lg`
    // up it sits beside the work and needs the container to read as a rail.
    <div className="lg:rounded-xl lg:border lg:bg-card lg:overflow-hidden">
      <div className="hidden lg:block px-5 py-3 border-b bg-muted/40">
        <h2 className="font-semibold text-xs flex items-center gap-2 uppercase tracking-wider">
          <IconInfoCircle size={14} className="text-primary" aria-hidden="true" />
          {t('instructions')}
        </h2>
      </div>
      <div className="lg:px-5 lg:py-4">
        {/* 68ch: the brief is the longest prose on the page and the rail runs
            past 85ch at desktop widths. */}
        <div className="prose prose-sm prose-neutral max-w-[68ch] dark:prose-invert prose-p:leading-relaxed prose-p:text-foreground/80 prose-strong:text-foreground prose-headings:text-foreground prose-headings:font-semibold prose-li:text-foreground/80 prose-headings:text-sm">
          <Markdown>{instructions}</Markdown>
        </div>
      </div>
    </div>
  )
}
