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

/**
 * The starter template split into its per-block segments — the same "one
 * block per paragraph" shape `blocksToMdx` produces (blocks joined by a
 * blank line, see `block-editor/serializer.ts`). Used to recognise an
 * untouched starter block regardless of locale or of where it ended up in
 * the document.
 */
const PLACEHOLDER_SEGMENTS = new Set(
  Object.values(LESSON_STARTER_TEMPLATE).flatMap((template) => template.split('\n\n'))
)

/**
 * Removes any still-untouched starter-template block from lesson MDX (#730).
 *
 * A brand-new lesson opens on the starter blocks (heading + body prompt +
 * objectives callout). If a creator adds their own block without editing or
 * deleting those, `blocksToMdx` happily serialises the untouched placeholders
 * right along with the real content, and students end up reading "Nuevo
 * tema / Escribe el contenido de la lección aquí...".
 *
 * `blocksToMdx` always joins blocks with a blank line, so splitting on that
 * same separator recovers one segment per block (in visual mode) or per
 * paragraph (in raw MDX mode). Any segment that still matches a starter
 * block verbatim, in either locale, is dropped; everything the creator wrote
 * or edited is left exactly as it was. Splitting and rejoining on the same
 * separator is lossless when nothing is removed, so this is a safe no-op on
 * content that never had a starter block in it.
 */
export function stripStarterPlaceholders(content: string): string {
  if (!content) return content
  const kept = content
    .split('\n\n')
    .filter((segment) => !PLACEHOLDER_SEGMENTS.has(segment))
  return kept.join('\n\n').trim()
}
