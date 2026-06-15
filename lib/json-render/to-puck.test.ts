/**
 * Unit tests for the json-render → Puck bridge (lib/json-render/to-puck.ts).
 *
 * These cover the pure conversion logic — especially the fallbacks that turn the
 * valid-but-misstructured specs LLMs commonly emit into a full, ordered page rather than an
 * empty or single-block one. No DB / network / Puck runtime: to-puck imports `Data` as a
 * type-only import, so this runs standalone.
 *
 * Run: npm run test:unit   (node:test via tsx)
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  arraySpecToSpec,
  normalizeSpec,
  cleanProps,
  specToPuckData,
  type JsonRenderSpec,
} from './to-puck'

// ── cleanProps ───────────────────────────────────────────────────────────────────────────────
test('cleanProps drops null/undefined but keeps falsy-valid values', () => {
  const out = cleanProps({ a: 0, b: '', c: false, d: null, e: undefined, f: [], g: 'x' })
  assert.deepEqual(out, { a: 0, b: '', c: false, f: [], g: 'x' })
})

test('cleanProps on empty/omitted input returns {}', () => {
  assert.deepEqual(cleanProps(), {})
  assert.deepEqual(cleanProps({}), {})
})

// ── arraySpecToSpec ──────────────────────────────────────────────────────────────────────────
test('arraySpecToSpec folds the array form into a keyed map', () => {
  const spec = arraySpecToSpec({
    root: 'root',
    elements: [
      { id: 'hero', type: 'HeroBlock', props: { title: 'Hi' }, children: [] },
      { id: 'cta', type: 'CtaBanner', props: {} },
    ],
  })
  assert.equal(spec.root, 'root')
  assert.deepEqual(Object.keys(spec.elements), ['hero', 'cta'])
  assert.deepEqual(spec.elements.hero, { type: 'HeroBlock', props: { title: 'Hi' }, children: [] })
})

test('arraySpecToSpec skips elements without an id', () => {
  const spec = arraySpecToSpec({
    root: 'root',
    // @ts-expect-error — intentionally malformed element (no id) like a bad LLM emission
    elements: [{ type: 'HeroBlock' }, { id: 'cta', type: 'CtaBanner' }],
  })
  assert.deepEqual(Object.keys(spec.elements), ['cta'])
})

test('arraySpecToSpec: duplicate ids — last one wins', () => {
  const spec = arraySpecToSpec({
    root: 'root',
    elements: [
      { id: 'x', type: 'HeroBlock', props: { title: 'first' } },
      { id: 'x', type: 'CtaBanner', props: { title: 'second' } },
    ],
  })
  assert.equal(Object.keys(spec.elements).length, 1)
  assert.equal(spec.elements.x.type, 'CtaBanner')
  assert.deepEqual(spec.elements.x.props, { title: 'second' })
})

test('arraySpecToSpec tolerates a missing elements array', () => {
  // @ts-expect-error — elements omitted
  const spec = arraySpecToSpec({ root: 'root' })
  assert.deepEqual(spec.elements, {})
})

// ── normalizeSpec ────────────────────────────────────────────────────────────────────────────
test('normalizeSpec backfills required structural fields', () => {
  const spec = normalizeSpec({
    root: 'root',
    elements: { hero: { type: 'HeroBlock' } as JsonRenderSpec['elements'][string] },
  })
  assert.deepEqual(spec.elements.hero, { type: 'HeroBlock', props: {}, children: [], visible: true })
})

test('normalizeSpec preserves provided values', () => {
  const spec = normalizeSpec({
    root: 'root',
    elements: {
      hero: { type: 'HeroBlock', props: { title: 'Hi' }, children: ['x'], visible: false },
    },
  })
  assert.deepEqual(spec.elements.hero, {
    type: 'HeroBlock',
    props: { title: 'Hi' },
    children: ['x'],
    visible: false,
  })
})

// ── specToPuckData ───────────────────────────────────────────────────────────────────────────
test('specToPuckData happy path: typeless root container orders sections by children', () => {
  const spec: JsonRenderSpec = {
    root: 'root',
    elements: {
      root: { type: '', props: {}, children: ['hero', 'cta'], visible: true },
      cta: { type: 'CtaBanner', props: {}, children: [], visible: true },
      hero: { type: 'HeroBlock', props: { title: 'Hi' }, children: [], visible: true },
    },
  }
  const data = specToPuckData(spec)
  // Order follows root.children (hero, cta) — NOT object insertion order (root, cta, hero).
  assert.deepEqual(
    data.content.map((c) => c.type),
    ['HeroBlock', 'CtaBanner']
  )
  assert.equal(data.content[0].props.id, 'hero')
  assert.deepEqual(data.root, { props: {} })
})

test('specToPuckData fallback (a): root id has no element → flatten all in insertion order', () => {
  const spec: JsonRenderSpec = {
    root: 'does-not-exist',
    elements: {
      hero: { type: 'HeroBlock', props: {}, children: [], visible: true },
      features: { type: 'FeaturesGrid', props: {}, children: [], visible: true },
      cta: { type: 'CtaBanner', props: {}, children: [], visible: true },
    },
  }
  const data = specToPuckData(spec)
  assert.deepEqual(
    data.content.map((c) => c.type),
    ['HeroBlock', 'FeaturesGrid', 'CtaBanner']
  )
})

test('specToPuckData fallback (b): a real typed section as root → flatten all (ignore nesting)', () => {
  // LLM made the HeroBlock the "root" and hung the rest off its children.
  const spec: JsonRenderSpec = {
    root: 'hero',
    elements: {
      hero: { type: 'HeroBlock', props: {}, children: ['features', 'cta'], visible: true },
      features: { type: 'FeaturesGrid', props: {}, children: [], visible: true },
      cta: { type: 'CtaBanner', props: {}, children: [], visible: true },
    },
  }
  const data = specToPuckData(spec)
  // All three render as top-level sections (hero is NOT dropped as a mere container).
  assert.deepEqual(
    data.content.map((c) => c.type),
    ['HeroBlock', 'FeaturesGrid', 'CtaBanner']
  )
})

test('specToPuckData merges defaults UNDER ai props (backfill + override)', () => {
  const spec: JsonRenderSpec = {
    root: 'missing',
    elements: {
      f: { type: 'FeaturesGrid', props: { title: 'Custom' }, children: [], visible: true },
    },
  }
  const defaults = { FeaturesGrid: { title: 'Default', items: [{ title: 'a' }], columns: '3' } }
  const data = specToPuckData(spec, defaults)
  const props = data.content[0].props as Record<string, unknown>
  assert.equal(props.title, 'Custom') // ai prop overrides default
  assert.deepEqual(props.items, [{ title: 'a' }]) // omitted array backfilled from default
  assert.equal(props.columns, '3')
  assert.equal(props.id, 'f') // stable id added
})

test('specToPuckData: null ai prop is cleaned so the default shows through', () => {
  const spec: JsonRenderSpec = {
    root: 'missing',
    elements: {
      h: { type: 'HeroBlock', props: { title: null }, children: [], visible: true },
    },
  }
  const data = specToPuckData(spec, { HeroBlock: { title: 'Default Title' } })
  assert.equal((data.content[0].props as Record<string, unknown>).title, 'Default Title')
})

test('specToPuckData honours a custom idFn', () => {
  const spec: JsonRenderSpec = {
    root: 'missing',
    elements: { hero: { type: 'HeroBlock', props: {}, children: [], visible: true } },
  }
  const data = specToPuckData(spec, {}, (key, i) => `blk-${key}-${i}`)
  assert.equal(data.content[0].props.id, 'blk-hero-0')
})

test('specToPuckData drops root children that reference missing elements', () => {
  const spec: JsonRenderSpec = {
    root: 'root',
    elements: {
      root: { type: '', props: {}, children: ['hero', 'ghost', 'cta'], visible: true },
      hero: { type: 'HeroBlock', props: {}, children: [], visible: true },
      cta: { type: 'CtaBanner', props: {}, children: [], visible: true },
    },
  }
  const data = specToPuckData(spec)
  assert.deepEqual(
    data.content.map((c) => c.type),
    ['HeroBlock', 'CtaBanner']
  )
})
