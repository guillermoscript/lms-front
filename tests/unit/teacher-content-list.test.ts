import { describe, expect, it } from 'vitest'
import { filterContent, type ContentListItem } from '@/lib/teacher-content-list'

const items: ContentListItem[] = [
  {
    id: 1,
    title: 'Zebra lesson',
    status: 'draft',
    sequence: 2,
    createdAt: '2026-01-01'
  },
  {
    id: 2,
    title: 'Apple lesson',
    status: 'published',
    sequence: 1,
    createdAt: '2026-03-01'
  },
  {
    id: 3,
    title: 'Archived apple',
    status: 'archived',
    sequence: null,
    createdAt: null
  },
  {
    id: 4,
    title: 'Legacy lesson',
    status: null,
    sequence: 3,
    createdAt: '2026-02-01'
  }
]

describe('teacher content list', () => {
  it('combines trimmed, case-insensitive search with status filtering', () => {
    expect(
      filterContent(items, ' APPLE ', 'published', 'title', 'en').map(
        (item) => item.id
      )
    ).toEqual([2])
    expect(
      filterContent(items, 'apple', 'archived', 'title', 'en').map(
        (item) => item.id
      )
    ).toEqual([3])
    expect(filterContent(items, 'missing', 'all', 'title', 'en')).toEqual([])
  })
  it('treats legacy null status as draft', () => {
    expect(
      filterContent(items, '', 'draft', 'order', 'en').map((item) => item.id)
    ).toEqual([1, 4])
  })
  it('sorts by curriculum order, title and newest without changing the original rows', () => {
    expect(
      filterContent(items, '', 'all', 'order', 'en').map((item) => item.id)
    ).toEqual([2, 1, 4, 3])
    expect(
      filterContent(items, '', 'all', 'newest', 'en').map((item) => item.id)
    ).toEqual([2, 4, 1, 3])
    expect(
      filterContent(items, '', 'all', 'title', 'en').map((item) => item.id)
    ).toEqual([2, 3, 4, 1])
    expect(items.map((item) => item.id)).toEqual([1, 2, 3, 4])
  })
  it('keeps tied rows deterministic and puts unsequenced items last', () => {
    const tied = [
      { id: 4, title: 'Same', status: 'draft', sequence: 2 },
      { id: 1, title: 'Same', status: 'draft', sequence: 2 },
      { id: 3, title: 'Same', status: 'draft' }
    ]
    expect(
      filterContent(tied, '', 'all', 'order', 'en').map((item) => item.id)
    ).toEqual([1, 4, 3])
  })
})
