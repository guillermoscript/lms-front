import type { Locale } from '@/i18n'

/**
 * Starter MDX for a brand-new lesson (#687).
 *
 * This lives as a plain constant and NOT under `messages/*.json` on purpose:
 * next-intl parses every message as ICU with rich-text tags, so a template that
 * contains `<Callout type="info">…</Callout>` throws `INVALID_MESSAGE:
 * INVALID_TAG` at runtime and the editor opens on the bare translation key.
 * The template is an editor artefact, not translator-facing copy.
 *
 * The callout is written in the same three-line form `blocksToMdx` emits, so
 * `mdxToBlocks` reads it back as a heading, a text block and a callout block.
 */
export const LESSON_STARTER_TEMPLATE: Record<Locale, string> = {
  en: [
    '# New topic',
    '',
    'Write the lesson content here...',
    '',
    '<Callout type="info">',
    'Add learning objectives here',
    '</Callout>',
  ].join('\n'),
  es: [
    '# Nuevo tema',
    '',
    'Escribe el contenido de la lección aquí...',
    '',
    '<Callout type="info">',
    'Añade los objetivos de aprendizaje aquí',
    '</Callout>',
  ].join('\n'),
}

/** The starter template for `locale`, falling back to English. */
export function getLessonStarterTemplate(locale: string): string {
  return LESSON_STARTER_TEMPLATE[locale as Locale] ?? LESSON_STARTER_TEMPLATE.en
}
