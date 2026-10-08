import { describe, expect, it } from 'vitest'
import { getAtPath, parsePath, resolveAppends, setAtPath } from '@lms/core'

describe('parsePath', () => {
  it('parses dotted and bracket paths', () => {
    expect(parsePath('title')).toEqual(['title'])
    expect(parsePath('items[2].title')).toEqual(['items', 2, 'title'])
    expect(parsePath('a.b[2].c')).toEqual(['a', 'b', 2, 'c'])
    expect(parsePath('items.2.title')).toEqual(['items', 2, 'title'])
    expect(parsePath('a[0][1]')).toEqual(['a', 0, 1])
  })

  it('rejects malformed and prototype-polluting paths', () => {
    for (const bad of ['', '.a', 'a.', 'a..b', '[0].a', 'a[x]', 'a]b', 'a[0]b', '__proto__.x', 'a.constructor', 'a.prototype']) {
      expect(parsePath(bad), bad).toBeNull()
    }
  })
})

describe('setAtPath / getAtPath', () => {
  it('copies only along the path', () => {
    const obj = { a: { b: [{ c: 'x' }, { c: 'y' }] }, other: { keep: true } }
    const next = setAtPath(obj, ['a', 'b', 1, 'c'], 'z')!
    expect(getAtPath(next, ['a', 'b', 1, 'c'])).toBe('z')
    expect(obj.a.b[1].c).toBe('y')
    expect(next.other).toBe(obj.other)
    expect(next.a.b[0]).toBe(obj.a.b[0])
  })

  it('returns null when an intermediate is missing or an index is out of range', () => {
    expect(setAtPath({ a: [] }, ['a', 0, 'b'], 'x')).toBeNull()
    expect(setAtPath({ a: 'str' }, ['a', 'b'], 'x')).toBeNull()
    expect(setAtPath({}, ['a', 'b'], 'x')).toBeNull()
  })
})

describe('resolveAppends', () => {
  it('appends tails, starting missing or null leaves from empty', () => {
    const props = { title: 'Hel', subtitle: null, items: [{ q: 'a' }, { q: 'b' }] }
    const { props: out, warnings } = resolveAppends(props, { title: 'lo', subtitle: 'Sub', 'items[1].q': '!', 'items[0].answer': 'new' })
    expect(warnings).toEqual([])
    expect(out).toEqual({ title: 'Hello', subtitle: 'Sub', items: [{ q: 'a', answer: 'new' }, { q: 'b!' }] })
    expect(props.title).toBe('Hel')
  })

  it('accumulates across successive calls (token streaming)', () => {
    let p: Record<string, unknown> = { items: [{ answer: '' }] }
    for (const tok of ['Str', 'eam', 'ing']) p = resolveAppends(p, { 'items[0].answer': tok }).props
    expect(p).toEqual({ items: [{ answer: 'Streaming' }] })
  })

  it('skips with a warning: bad paths, non-text leaves, missing items, keys also set in props', () => {
    const { props, warnings } = resolveAppends(
      { count: 3, items: [{ q: '' }], title: 'x' },
      { count: '1', 'items[5].q': 'x', 'bad..path': 'x', title: 'y', 'ok': 'fine' },
      new Set(['title'])
    )
    expect(props).toEqual({ count: 3, items: [{ q: '' }], title: 'x', ok: 'fine' })
    expect(warnings).toHaveLength(4)
    expect(warnings.join('\n')).toMatch(/not a text field/)
    expect(warnings.join('\n')).toMatch(/does not exist/)
    expect(warnings.join('\n')).toMatch(/invalid path/)
    expect(warnings.join('\n')).toMatch(/also set in props/)
  })
})
