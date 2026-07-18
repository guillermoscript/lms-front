/**
 * Auto-derive a Zod schema from a Puck component's `fields` definition.
 *
 * This is the codegen step ADR 0001 called for: instead of hand-maintaining a parallel
 * json-render catalog, we generate each component's props schema directly from its Puck
 * `fields`. One source of truth (`lib/puck/config.ts`) feeds both the human editor and the
 * AI generator, so they can never drift.
 *
 * Supported Puck field types (the full set in use): text, textarea, number, radio, select,
 * array (with nested arrayFields, including arrays-of-arrays). All fields are made
 * `.nullable().optional()` with a description, because:
 *   - LLMs routinely omit fields, and missing props fall back to the Puck component's own
 *     `defaultProps` at render time (see specToPuckData), so partial specs still render.
 *   - `.describe()` text becomes guidance in the AI system prompt via catalog.prompt().
 */
import { z } from 'zod'

// Minimal structural type for a Puck field (we only read what we convert).
interface PuckOption {
  label: string
  value: string | number | boolean
}
interface PuckField {
  type: 'text' | 'textarea' | 'number' | 'radio' | 'select' | 'array'
  label?: string
  options?: PuckOption[]
  arrayFields?: Record<string, PuckField>
}

function describe(zt: z.ZodTypeAny, label?: string): z.ZodTypeAny {
  return label ? zt.describe(label) : zt
}

/** Convert a single Puck field to a Zod type. */
function fieldToZod(field: PuckField): z.ZodTypeAny {
  switch (field.type) {
    case 'text':
    case 'textarea':
      return describe(z.string(), field.label)

    case 'number':
      return describe(z.number(), field.label)

    case 'radio':
    case 'select': {
      const values = (field.options ?? []).map((o) => String(o.value))
      // enum needs at least one value; fall back to string if options are dynamic/empty.
      if (values.length === 0) return describe(z.string(), field.label)
      return describe(z.enum(values as [string, ...string[]]), field.label)
    }

    case 'array': {
      const shape: Record<string, z.ZodTypeAny> = {}
      for (const [k, sub] of Object.entries(field.arrayFields ?? {})) {
        // Items within an array are optional/nullable for the same partial-spec reasons.
        shape[k] = fieldToZod(sub).nullable().optional()
      }
      const item = z.object(shape)
      return describe(z.array(item), field.label)
    }

    default:
      return describe(z.unknown(), field.label)
  }
}

/**
 * Convert a Puck component's full `fields` map into a Zod object schema for the catalog.
 * Every prop is nullable + optional so partial AI output validates and renders.
 */
export function puckFieldsToZod(
  fields: Record<string, PuckField> | undefined
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {}
  for (const [name, field] of Object.entries(fields ?? {})) {
    shape[name] = fieldToZod(field).nullable().optional()
  }
  return z.object(shape)
}
