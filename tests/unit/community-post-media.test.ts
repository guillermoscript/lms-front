import { describe, expect, it } from 'vitest'
import { MAX_POST_MEDIA, parsePostMedia } from '@/lib/community/media'

const ctx = { supabaseUrl: 'https://db.example.co/', tenantId: 't1', userId: 'u1' }
const own = (file: string) => `https://db.example.co/storage/v1/object/public/community-assets/t1/u1/${file}`

describe('parsePostMedia (#860)', () => {
  it('accepts files from the poster’s own folder', () => {
    const media = [{ url: own('a.png'), type: 'image', name: 'a.png' }]
    expect(parsePostMedia(JSON.stringify(media), ctx)).toEqual(media)
  })

  it('treats a missing payload as no media', () => {
    expect(parsePostMedia(null, ctx)).toEqual([])
  })

  it.each([
    ['another user’s folder', 'https://db.example.co/storage/v1/object/public/community-assets/t1/u2/a.png'],
    ['another school’s folder', 'https://db.example.co/storage/v1/object/public/community-assets/t2/u1/a.png'],
    ['an external host', 'https://evil.example/a.png'],
    ['a javascript: url', 'javascript:alert(1)'],
    ['a traversal', own('../../t2/u1/a.png')],
    ['a nested path', own('sub/a.png')],
  ])('rejects %s', (_, url) => {
    expect(parsePostMedia(JSON.stringify([{ url, type: 'image', name: 'x' }]), ctx)).toBeNull()
  })

  it('rejects an unknown media type, malformed JSON and too many files', () => {
    expect(parsePostMedia(JSON.stringify([{ url: own('a'), type: 'script', name: 'x' }]), ctx)).toBeNull()
    expect(parsePostMedia('{not json', ctx)).toBeNull()
    const many = Array.from({ length: MAX_POST_MEDIA + 1 }, (_, i) => ({ url: own(`${i}.png`), type: 'image', name: 'x' }))
    expect(parsePostMedia(JSON.stringify(many), ctx)).toBeNull()
  })
})
