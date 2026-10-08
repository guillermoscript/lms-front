import { describe, expect, it } from 'vitest'
import {
  ROOT_ZONE,
  applyOps,
  createCatalog,
  expandDuplicate,
  findNode,
  formatOutline,
  outline,
  pageOpSchema,
  zoneKey,
  type PageBuilderManifest,
  type PageData,
  type PageOp,
} from '@lms/core'

// A tiny manifest so the reducer tests do not depend on the live block vocabulary.
const manifest: PageBuilderManifest = {
  shared: { instructions: '' },
  components: {
    Hero: {
      category: null,
      fields: { title: { type: 'text' }, subtitle: { type: 'textarea' } },
      defaultProps: { title: 'Default title', subtitle: '' },
    },
    Faq: {
      category: null,
      fields: {
        title: { type: 'text' },
        items: {
          type: 'array',
          arrayFields: { question: { type: 'text' }, answer: { type: 'textarea' } },
        },
        footer: {
          type: 'array',
          arrayFields: {
            label: { type: 'text' },
            links: { type: 'array', arrayFields: { href: { type: 'text' } } },
            rating: { type: 'number' },
          },
          defaultItemProps: { label: 'Placeholder', rating: 5 },
        },
      },
      defaultProps: { title: 'FAQ', items: [{ question: 'Q?', answer: 'A.' }], footer: [] },
    },
    Columns: {
      category: null,
      fields: {},
      defaultProps: {},
      ai: { instructions: 'layout', exclude: true, zones: ['left', 'middle', 'right', 'main'] },
    },
  },
}
const catalog = createCatalog(manifest)

function page(): PageData {
  return {
    root: { props: { metaTitle: 'Home' } },
    content: [
      { type: 'Hero', props: { id: 'hero-1', title: 'Hello', subtitle: '' } },
      { type: 'Columns', props: { id: 'cols-1' } },
      { type: 'Faq', props: { id: 'faq-1', title: 'Questions', items: [{ question: 'Why?', answer: 'Because' }], footer: [] } },
    ],
    zones: {
      'cols-1:left': [{ type: 'Hero', props: { id: 'hero-left', title: 'Left' } }],
      'cols-1:right': [{ type: 'Columns', props: { id: 'cols-inner' } }],
      'cols-inner:main': [{ type: 'Hero', props: { id: 'hero-deep', title: 'Deep' } }],
    },
  }
}

const ids = (items: { props: { id: string } }[] | undefined) => (items ?? []).map((i) => i.props.id)

describe('pageOpSchema', () => {
  it('accepts the six wire ops and rejects duplicate (critique A1)', () => {
    const ops: PageOp[] = [
      { op: 'add', id: 'x', type: 'Hero', zone: ROOT_ZONE, index: 0, props: {} },
      { op: 'update', id: 'x', props: { title: 'a' }, appends: { subtitle: 'b' } },
      { op: 'updateRoot', props: { metaTitle: 'x' } },
      { op: 'move', id: 'x', zone: ROOT_ZONE, index: 1 },
      { op: 'remove', id: 'x' },
      { op: 'reset' },
    ]
    for (const op of ops) expect(pageOpSchema.safeParse(op).success).toBe(true)
    expect(pageOpSchema.safeParse({ op: 'duplicate', id: 'x', newId: 'y' }).success).toBe(false)
  })
})

describe('applyOps', () => {
  it('never mutates its input', () => {
    const data = page()
    const before = JSON.stringify(data)
    applyOps(data, [{ op: 'remove', id: 'hero-1' }, { op: 'update', id: 'faq-1', props: { title: 'x' } }], catalog)
    expect(JSON.stringify(data)).toBe(before)
  })

  it('add merges defaultProps, fills array items, clamps the index and keeps the server id', () => {
    const { data, warnings, applied } = applyOps(
      page(),
      [
        { op: 'add', id: 'faq-2', type: 'Faq', zone: ROOT_ZONE, index: 1, props: { id: 'model-id', footer: [{ links: [{}] }] } },
        { op: 'add', id: 'hero-2', type: 'Hero', zone: ROOT_ZONE, index: 99, props: { title: 'Last' } },
      ],
      catalog
    )
    expect(warnings).toEqual([])
    expect(applied).toBe(2)
    expect(ids(data.content)).toEqual(['hero-1', 'faq-2', 'cols-1', 'faq-1', 'hero-2'])
    const faq = findNode(data, 'faq-2')!.item
    expect(faq.props.id).toBe('faq-2')
    expect(faq.props.title).toBe('FAQ')
    expect(faq.props.items).toEqual([{ question: 'Q?', answer: 'A.' }])
    // Placeholder TEXT is not copied from defaultItemProps; non-text defaults are.
    expect(faq.props.footer).toEqual([{ label: '', rating: 5, links: [{ href: '' }] }])
    expect(findNode(data, 'hero-2')!.item.props).toMatchObject({ title: 'Last', subtitle: '' })
  })

  it('add into a DropZone of an existing parent creates the zone', () => {
    const { data, warnings } = applyOps(
      page(),
      [{ op: 'add', id: 'hero-new', type: 'Hero', zone: zoneKey('cols-1', 'middle'), index: 0, props: {} }],
      catalog
    )
    expect(warnings).toEqual([])
    expect(ids(data.zones!['cols-1:middle'])).toEqual(['hero-new'])
  })

  it('refuses a new zone its parent does not render (a Hero has no DropZone; Columns has no "side")', () => {
    for (const zone of [zoneKey('hero-1', 'main'), zoneKey('cols-1', 'side')]) {
      const { warnings } = applyOps(page(), [{ op: 'add', id: 'n', type: 'Hero', zone, index: 0, props: {} }], catalog)
      expect(warnings[0]).toMatch(/does not exist/)
    }
  })

  it('skips bad ops with a warning and keeps going', () => {
    const { data, warnings, applied } = applyOps(
      page(),
      [
        { op: 'add', id: 'x1', type: 'Nope', zone: ROOT_ZONE, index: 0, props: {} },
        { op: 'add', id: 'hero-1', type: 'Hero', zone: ROOT_ZONE, index: 0, props: {} },
        { op: 'add', id: 'x2', type: 'Hero', zone: 'ghost:main', index: 0, props: {} },
        { op: 'update', id: 'ghost', props: { title: 'x' } },
        { op: 'move', id: 'ghost', zone: ROOT_ZONE, index: 0 },
        { op: 'remove', id: 'ghost' },
        { op: 'update', id: 'hero-1', props: { title: 'Still applied' } },
      ],
      catalog
    )
    expect(applied).toBe(1)
    expect(warnings).toHaveLength(6)
    expect(warnings[0]).toMatch(/unknown block type/)
    expect(warnings[1]).toMatch(/already exists/)
    expect(warnings[2]).toMatch(/zone/)
    expect(findNode(data, 'hero-1')!.item.props.title).toBe('Still applied')
  })

  it('update is a shallow merge: arrays are replaced whole and filled; the id never changes', () => {
    const { data } = applyOps(
      page(),
      [{ op: 'update', id: 'faq-1', props: { id: 'hijack', items: [{ question: 'New?' }] } }],
      catalog
    )
    const faq = findNode(data, 'faq-1')!.item
    expect(faq.props.id).toBe('faq-1')
    expect(findNode(data, 'hijack')).toBeNull()
    expect(faq.props.title).toBe('Questions')
    expect(faq.props.items).toEqual([{ question: 'New?', answer: '' }])
  })

  it('update applies appends, including nested array paths, in zones too', () => {
    const { data, warnings } = applyOps(
      page(),
      [
        { op: 'update', id: 'faq-1', appends: { 'items[0].answer': ' it works', title: '!' } },
        { op: 'update', id: 'hero-deep', appends: { subtitle: 'tok' } },
        { op: 'update', id: 'hero-deep', appends: { subtitle: 'en' } },
      ],
      catalog
    )
    expect(warnings).toEqual([])
    const faq = findNode(data, 'faq-1')!.item
    expect(faq.props.title).toBe('Questions!')
    expect((faq.props.items as { answer: string }[])[0].answer).toBe('Because it works')
    expect(findNode(data, 'hero-deep')!.item.props.subtitle).toBe('token')
  })

  it('a key set in props ignores its append (never both)', () => {
    const { data, warnings } = applyOps(
      page(),
      [{ op: 'update', id: 'hero-1', props: { title: 'Set' }, appends: { title: ' appended' } }],
      catalog
    )
    expect(findNode(data, 'hero-1')!.item.props.title).toBe('Set')
    expect(warnings[0]).toMatch(/also set in props/)
  })

  it('updateRoot merges root props and supports appends', () => {
    const { data } = applyOps(
      page(),
      [{ op: 'updateRoot', props: { metaDescription: 'Desc' }, appends: { metaTitle: ' page' } }],
      catalog
    )
    expect(data.root.props).toEqual({ metaTitle: 'Home page', metaDescription: 'Desc' })
  })

  it('move works within a zone, across zones, and refuses a move into its own subtree', () => {
    const within = applyOps(page(), [{ op: 'move', id: 'hero-1', zone: ROOT_ZONE, index: 2 }], catalog).data
    expect(ids(within.content)).toEqual(['cols-1', 'faq-1', 'hero-1'])

    const across = applyOps(page(), [{ op: 'move', id: 'hero-deep', zone: ROOT_ZONE, index: 0 }], catalog).data
    expect(ids(across.content)).toEqual(['hero-deep', 'hero-1', 'cols-1', 'faq-1'])
    expect(across.zones!['cols-inner:main']).toEqual([])

    const intoSelf = applyOps(page(), [{ op: 'move', id: 'cols-1', zone: 'cols-inner:main', index: 0 }], catalog)
    expect(intoSelf.applied).toBe(0)
    expect(intoSelf.warnings[0]).toMatch(/own zone/)
  })

  it('remove cascades to the child zones of the block and of its descendants', () => {
    const { data } = applyOps(page(), [{ op: 'remove', id: 'cols-1' }], catalog)
    expect(ids(data.content)).toEqual(['hero-1', 'faq-1'])
    expect(data.zones).toEqual({})
    expect(findNode(data, 'hero-deep')).toBeNull()
  })

  it('reset empties the page and sets the root', () => {
    const { data } = applyOps(page(), [{ op: 'reset', root: { metaTitle: 'New' } }], catalog)
    expect(data).toEqual({ root: { props: { metaTitle: 'New' } }, content: [], zones: {} })
  })

  it('works without a catalog (no defaults, any type)', () => {
    const { data, warnings } = applyOps(
      { root: { props: {} }, content: [] },
      [{ op: 'add', id: 'a', type: 'Anything', zone: ROOT_ZONE, index: 0, props: { x: 1 } }]
    )
    expect(warnings).toEqual([])
    expect(data.content).toEqual([{ type: 'Anything', props: { x: 1, id: 'a' } }])
  })
})

describe('expandDuplicate (server-side duplicate → add ops)', () => {
  it('copies the block after the original with fresh ids, re-keying nested zones', () => {
    let n = 0
    const idFactory = (type: string) => `${type}-dup${++n}`
    const data = page()
    const expanded = expandDuplicate(data, 'cols-1', idFactory)!
    expect(expanded.newId).toBe('Columns-dup1')
    expect(expanded.ops.map((o) => [o.id, o.zone, o.index])).toEqual([
      ['Columns-dup1', ROOT_ZONE, 2],
      ['Hero-dup2', 'Columns-dup1:left', 0],
      ['Columns-dup3', 'Columns-dup1:right', 0],
      ['Hero-dup4', 'Columns-dup3:main', 0],
    ])
    const { data: next, warnings } = applyOps(data, expanded.ops, catalog)
    expect(warnings).toEqual([])
    expect(ids(next.content)).toEqual(['hero-1', 'cols-1', 'Columns-dup1', 'faq-1'])
    expect(findNode(next, 'Hero-dup4')!.item.props.title).toBe('Deep')
    // The original subtree is untouched.
    expect(findNode(next, 'hero-deep')!.zone).toBe('cols-inner:main')
    expect(expandDuplicate(data, 'missing')).toBeNull()
  })
})

describe('outline', () => {
  it('lists blocks depth-first with zones, summaries and the selected marker', () => {
    const entries = outline(page())
    expect(entries.map((e) => [e.id, e.depth])).toEqual([
      ['hero-1', 0],
      ['cols-1', 0],
      ['hero-left', 1],
      ['cols-inner', 1],
      ['hero-deep', 2],
      ['faq-1', 0],
    ])
    expect(entries[0].summary).toBe('Hello')
    const text = formatOutline(page(), 'faq-1')
    expect(text).toContain('Hero [hero-1] "Hello"')
    expect(text).toContain('Hero [hero-deep] in main "Deep"')
    expect(text).toMatch(/Faq \[faq-1\] "Questions" {2}<- selected/)
    expect(formatOutline({ root: { props: {} }, content: [] })).toBe('(empty page)')
  })
})
