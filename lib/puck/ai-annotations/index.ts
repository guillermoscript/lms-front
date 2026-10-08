/**
 * The AI annotation side-map (Page Architect, design §3.4 + critique G).
 *
 * A directory so parallel work packages each own one file:
 *   - `base.ts`          WP0 — existing blocks + shared spacing fields
 *   - `course-blocks.ts` WP3 — data-bound course/product blocks
 *   - `style.ts`         WP4 — shared style tokens (under `'*'`)
 *
 * Merged per component: later files add fields to (and may override the instructions of)
 * earlier ones. Folded into the core manifest by `npm run gen:puck-fields`, and re-exported
 * as the old `COMPONENT_DESCRIPTIONS`/`EXCLUDED_COMPONENTS` by `lib/json-render/catalog-meta.ts`.
 *
 * PURE DATA: never import React, Puck or `lib/puck/config.ts` here.
 */
import { BASE_ANNOTATIONS } from './base'
import { COURSE_BLOCK_ANNOTATIONS } from './course-blocks'
import { STYLE_ANNOTATIONS } from './style'
import type { AiAnnotations, AiComponentAnnotation } from './types'

export type { AiAnnotations, AiComponentAnnotation, AiFieldAnnotation, AiFieldRef } from './types'

/** Key of the shared-fields entry (spacing + style tokens), described once in the prompt. */
export const SHARED_FIELDS_KEY = '*'

function mergeAnnotations(...sources: AiAnnotations[]): AiAnnotations {
  const out: AiAnnotations = {}
  for (const source of sources) {
    for (const [name, entry] of Object.entries(source)) {
      const prev: AiComponentAnnotation | undefined = out[name]
      out[name] = {
        ...prev,
        ...entry,
        instructions: entry.instructions || prev?.instructions || '',
        fields: { ...prev?.fields, ...entry.fields },
      }
    }
  }
  return out
}

export const AI_ANNOTATIONS: AiAnnotations = mergeAnnotations(
  BASE_ANNOTATIONS,
  COURSE_BLOCK_ANNOTATIONS,
  STYLE_ANNOTATIONS
)
