import { describe, expect, it, vi } from 'vitest'
import type { FileUIPart } from 'ai'
import {
    hasSubmittableContent,
    prepareChatFiles,
    IMAGE_MAX_EDGE_PX,
    IMAGE_REENCODE_THRESHOLD_BYTES,
    type ImageEncoder,
} from '@/lib/ai/attachments-client'

const png = (len: number): FileUIPart => ({
    type: 'file',
    mediaType: 'image/png',
    filename: 'shot.png',
    url: `data:image/png;base64,${'A'.repeat(len)}`,
})

const encoderFor = (width: number, height: number, encodedLen: number): ImageEncoder & { encode: ReturnType<typeof vi.fn> } => ({
    decode: vi.fn(async () => ({ width, height, source: {} as CanvasImageSource, close: vi.fn() })),
    encode: vi.fn(() => `data:image/jpeg;base64,${'B'.repeat(encodedLen)}`),
})

describe('hasSubmittableContent', () => {
    it('accepts text, accepts files alone, rejects whitespace-only with no files', () => {
        expect(hasSubmittableContent({ text: 'hi' })).toBe(true)
        expect(hasSubmittableContent({ text: '', files: [png(10)] })).toBe(true)
        expect(hasSubmittableContent({ text: '   ', files: [] })).toBe(false)
        expect(hasSubmittableContent({})).toBe(false)
    })
})

describe('prepareChatFiles', () => {
    it('returns [] for no files', async () => {
        expect(await prepareChatFiles(undefined, encoderFor(1, 1, 1))).toEqual([])
    })

    it('passes through non-data URLs, gifs and non-image parts without decoding', async () => {
        const enc = encoderFor(4000, 3000, 10)
        const https: FileUIPart = { type: 'file', mediaType: 'image/png', url: 'https://x/a.png' }
        const gif: FileUIPart = { type: 'file', mediaType: 'image/gif', url: 'data:image/gif;base64,AAAA' }
        const pdf: FileUIPart = { type: 'file', mediaType: 'application/pdf', url: 'data:application/pdf;base64,AAAA' }
        expect(await prepareChatFiles([https, gif, pdf], enc)).toEqual([https, gif, pdf])
        expect(enc.decode).not.toHaveBeenCalled()
    })

    it('leaves small, light images untouched', async () => {
        const enc = encoderFor(800, 600, 10)
        const file = png(1000)
        expect(await prepareChatFiles([file], enc)).toEqual([file])
        expect(enc.encode).not.toHaveBeenCalled()
    })

    it('downscales large images to the max edge as JPEG', async () => {
        const enc = encoderFor(4000, 2000, 100)
        const [out] = await prepareChatFiles([png(1000)], enc)
        expect(enc.encode).toHaveBeenCalledWith(expect.anything(), IMAGE_MAX_EDGE_PX, 800, 'image/jpeg', expect.any(Number))
        expect(out.mediaType).toBe('image/jpeg')
        expect(out.url.startsWith('data:image/jpeg')).toBe(true)
    })

    it('re-encodes heavy small PNGs as PNG, keeping dimensions', async () => {
        const enc = encoderFor(800, 600, 100)
        const [out] = await prepareChatFiles([png(IMAGE_REENCODE_THRESHOLD_BYTES + 10)], enc)
        expect(enc.encode).toHaveBeenCalledWith(expect.anything(), 800, 600, 'image/png', undefined)
        expect(out.mediaType).toBe('image/png')
    })

    it('keeps the original when re-encoding does not shrink it', async () => {
        const enc = encoderFor(4000, 2000, 5000)
        const file = png(1000)
        expect(await prepareChatFiles([file], enc)).toEqual([file])
    })

    it('falls back to the original when decoding fails', async () => {
        const enc: ImageEncoder = { decode: vi.fn(async () => { throw new Error('bad image') }), encode: vi.fn() }
        const file = png(1000)
        expect(await prepareChatFiles([file], enc)).toEqual([file])
    })
})
