import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))

import { sanitizeLastUserAttachments, lastUserMessageHasAttachments } from '@/lib/ai/attachments'
import { AI_ATTACHMENT_MAX_BYTES, AI_ATTACHMENT_MAX_FILES } from '@/lib/ai/attachment-limits'

const png = (bytes = 16) => `data:image/png;base64,${'A'.repeat(Math.ceil((bytes * 4) / 3))}`
const file = (url: string, mediaType?: string) => ({ type: 'file', url, mediaType })
const user = (parts: unknown[]) => ({ role: 'user', parts }) as { role: string; parts: { type?: string; url?: string; mediaType?: string; text?: string }[] }

describe('sanitizeLastUserAttachments', () => {
    it('keeps small image data URLs and text', () => {
        const [msg] = sanitizeLastUserAttachments([user([{ type: 'text', text: 'hi' }, file(png(), 'image/png')])])
        expect(msg.parts).toHaveLength(2)
    })

    it('drops non-image media, oversized images, and non-http(s) URLs', () => {
        const [msg] = sanitizeLastUserAttachments([
            user([
                file('data:application/pdf;base64,AAAA', 'application/pdf'),
                file(png(AI_ATTACHMENT_MAX_BYTES + 1024), 'image/png'),
                file('blob:http://x/abc', 'image/png'),
                file('http://insecure.example/a.png', 'image/png'),
                file('https://signed.example/a.png', 'image/png'),
            ]),
        ])
        expect(msg.parts).toEqual([file('https://signed.example/a.png', 'image/png')])
    })

    it('infers the media type from the data URL when missing', () => {
        const [msg] = sanitizeLastUserAttachments([user([file(png())])])
        expect(msg.parts).toHaveLength(1)
    })

    it('caps the number of images', () => {
        const parts = Array.from({ length: AI_ATTACHMENT_MAX_FILES + 2 }, () => file(png(), 'image/png'))
        const [msg] = sanitizeLastUserAttachments([user(parts)])
        expect(msg.parts).toHaveLength(AI_ATTACHMENT_MAX_FILES)
    })

    it('leaves assistant tails and earlier data-URL images alone', () => {
        const earlier = user([file(png(), 'image/png')])
        const msgs = sanitizeLastUserAttachments([earlier, { role: 'assistant', parts: [{ type: 'text', text: 'ok' }] }])
        expect(msgs[0]).toBe(earlier)
    })

    it('replaces expired-prone signed URLs in earlier turns with a text note', () => {
        const msgs = sanitizeLastUserAttachments([
            user([{ type: 'file', url: 'https://signed.example/a.png', mediaType: 'image/png', filename: 'a.png' } as never]),
            { role: 'assistant', parts: [{ type: 'text', text: 'ok' }] },
            user([{ type: 'text', text: 'and now?' }]),
        ])
        expect(msgs[0].parts).toEqual([{ type: 'text', text: '[image attached earlier: a.png]' }])
        expect(msgs[2].parts).toEqual([{ type: 'text', text: 'and now?' }])
    })
})

describe('lastUserMessageHasAttachments', () => {
    it('is true only when the last user message has a file part', () => {
        expect(lastUserMessageHasAttachments([user([file(png())])])).toBe(true)
        expect(lastUserMessageHasAttachments([user([{ type: 'text', text: 'x' }])])).toBe(false)
        expect(lastUserMessageHasAttachments([user([file(png())]), { role: 'assistant', parts: [] }])).toBe(false)
    })
})
