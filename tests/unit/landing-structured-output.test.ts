import { describe, it, expect } from 'vitest'
import { Output, asSchema } from 'ai'
import { blockEditShape, pageSpecShape } from '@/lib/json-render/spec-schemas'

/**
 * Smoke check for BYOK (issue: per-tenant providers): the landing builder's structured
 * output must stay inside the JSON-Schema subset that OpenAI strict mode and the other
 * providers accept. We inspect the schema the AI SDK actually derives from the zod shapes
 * (the thing `Output.object` sends), not the zod source.
 */

type Json = Record<string, unknown>

async function jsonSchemaOf(schema: Parameters<typeof asSchema>[0]): Promise<Json> {
  return (await asSchema(schema).jsonSchema) as Json
}

/** Every object node in the schema tree. */
function objectNodes(node: unknown, out: Json[] = []): Json[] {
  if (!node || typeof node !== 'object') return out
  const n = node as Json
  if (n.type === 'object') out.push(n)
  for (const v of Object.values(n)) {
    if (Array.isArray(v)) v.forEach((x) => objectNodes(x, out))
    else objectNodes(v, out)
  }
  return out
}

const SHAPES = [
  ['pageSpecShape', pageSpecShape],
  ['blockEditShape', blockEditShape],
] as const

describe.each(SHAPES)('%s is OpenAI-strict compatible', (_name, shape) => {
  it('has every property required, additionalProperties:false, and no propertyNames', async () => {
    const schema = await jsonSchemaOf(shape)
    const text = JSON.stringify(schema)
    expect(text).not.toContain('propertyNames')
    expect(text).not.toContain('patternProperties')
    expect(text).not.toContain('"anyOf"')
    expect(text).not.toContain('"oneOf"')

    const objects = objectNodes(schema)
    expect(objects.length).toBeGreaterThan(0)
    for (const obj of objects) {
      const keys = Object.keys((obj.properties as Json) ?? {}).sort()
      expect([...((obj.required as string[]) ?? [])].sort()).toEqual(keys)
      expect(obj.additionalProperties).toBe(false)
    }
  })

  it('is accepted by Output.object', () => {
    expect(() => Output.object({ schema: shape as never })).not.toThrow()
  })
})

describe('landing page spec shape', () => {
  it('keeps props as a JSON string and elements as an array', async () => {
    const schema = (await jsonSchemaOf(pageSpecShape)) as {
      properties: { elements: { type: string; items: { properties: Record<string, { type: string }> } } }
    }
    expect(schema.properties.elements.type).toBe('array')
    expect(schema.properties.elements.items.properties.propsJson.type).toBe('string')
    expect(schema.properties.elements.items.properties.children.type).toBe('array')
  })
})
