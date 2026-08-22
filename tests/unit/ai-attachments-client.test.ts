import { describe, expect, it, vi } from 'vitest'
import type { FileUIPart } from 'ai'
import {
    hasSubmittableContent,
    prepareChatFiles,
    IMAGE_MAX_EDGE_PX,
    IMAGE_REENCODE_THRESHOLD_BYTES,
    type ImageEncoder,
} from '@/lib/ai/attachments-client'
import { AI_ATTACHMENT_MAX_BYTES } from '@/lib/ai/attachment-limits'

const png = (len: number): FileUIPart => ({
    type: 'file',
    mediaType: 'image/png',
    filename: 'shot.png',
    url: `data:image/png;base64,${'A'.repeat(len)}`,
})

/** Base64 chars needed to encode roughly `bytes` bytes. */
const charsFor = (bytes: number) => Math.ceil((bytes * 4) / 3)

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
    it('returns nothing for no files', async () => {
        expect(await prepareChatFiles(undefined, encoderFor(1, 1, 1))).toEqual({ files: [], rejected: [] })
    })

    it('passes through history URLs and small gifs without decoding', async () => {
        const enc = encoderFor(4000, 3000, 10)
        const https: FileUIPart = { type: 'file', mediaType: 'image/png', url: 'https://x/a.png' }
        const gif: FileUIPart = { type: 'file', mediaType: 'image/gif', url: 'data:image/gif;base64,AAAA' }
        const { files, rejected } = await prepareChatFiles([https, gif], enc)
        expect(files).toEqual([https, gif])
        expect(rejected).toEqual([])
        expect(enc.decode).not.toHaveBeenCalled()
    })

    it('rejects non-image parts instead of letting the server drop them silently', async () => {
        const pdf: FileUIPart = { type: 'file', mediaType: 'application/pdf', filename: 'notes.pdf', url: 'data:application/pdf;base64,AAAA' }
        const { files, rejected } = await prepareChatFiles([pdf], encoderFor(1, 1, 1))
        expect(files).toEqual([])
        expect(rejected).toEqual([{ filename: 'notes.pdf', reason: 'unsupported' }])
    })

    it('rejects gifs over the wire limit — a canvas pass would flatten them', async () => {
        const gif: FileUIPart = {
            type: 'file',
            mediaType: 'image/gif',
            filename: 'loop.gif',
            url: `data:image/gif;base64,${'A'.repeat(charsFor(AI_ATTACHMENT_MAX_BYTES + 1024))}`,
        }
        const { files, rejected } = await prepareChatFiles([gif], encoderFor(1, 1, 1))
        expect(files).toEqual([])
        expect(rejected).toEqual([{ filename: 'loop.gif', reason: 'too_large' }])
    })

    it('leaves small, light images untouched', async () => {
        const enc = encoderFor(800, 600, 10)
        const file = png(1000)
        expect(await prepareChatFiles([file], enc)).toEqual({ files: [file], rejected: [] })
        expect(enc.encode).not.toHaveBeenCalled()
    })

    it('downscales large images to the max edge as JPEG', async () => {
        const enc = encoderFor(4000, 2000, 100)
        const { files } = await prepareChatFiles([png(1000)], enc)
        expect(enc.encode).toHaveBeenCalledWith(expect.anything(), IMAGE_MAX_EDGE_PX, 800, 'image/jpeg', expect.any(Number))
        expect(files[0].mediaType).toBe('image/jpeg')
        expect(files[0].url.startsWith('data:image/jpeg')).toBe(true)
    })

    it('re-encodes heavy small PNGs as PNG, keeping dimensions', async () => {
        const enc = encoderFor(800, 600, 100)
        const { files } = await prepareChatFiles([png(IMAGE_REENCODE_THRESHOLD_BYTES + 10)], enc)
        expect(enc.encode).toHaveBeenCalledWith(expect.anything(), 800, 600, 'image/png', undefined)
        expect(files[0].mediaType).toBe('image/png')
    })

    it('transcodes a format the model cannot read into JPEG', async () => {
        const enc = encoderFor(800, 600, 100)
        const heic: FileUIPart = { type: 'file', mediaType: 'image/heic', filename: 'IMG_1.heic', url: 'data:image/heic;base64,AAAA' }
        const { files, rejected } = await prepareChatFiles([heic], enc)
        expect(rejected).toEqual([])
        expect(files[0].mediaType).toBe('image/jpeg')
        expect(enc.encode).toHaveBeenCalledWith(expect.anything(), 800, 600, 'image/jpeg', expect.any(Number))
    })

    it('steps down the resize ladder until the image fits the wire limit', async () => {
        const tooBig = `data:image/jpeg;base64,${'B'.repeat(charsFor(AI_ATTACHMENT_MAX_BYTES + 1024))}`
        const small = `data:image/jpeg;base64,${'B'.repeat(100)}`
        const enc: ImageEncoder & { encode: ReturnType<typeof vi.fn> } = {
            decode: vi.fn(async () => ({ width: 8000, height: 4000, source: {} as CanvasImageSource, close: vi.fn() })),
            encode: vi.fn().mockReturnValueOnce(tooBig).mockReturnValue(small),
        }
        const { files, rejected } = await prepareChatFiles([png(charsFor(AI_ATTACHMENT_MAX_BYTES + 2048))], enc)
        expect(enc.encode).toHaveBeenCalledTimes(2)
        expect(enc.encode).toHaveBeenLastCalledWith(expect.anything(), 1200, 600, 'image/jpeg', expect.any(Number))
        expect(files[0].url).toBe(small)
        expect(rejected).toEqual([])
    })

    it('rejects an oversized image the ladder never gets under the limit', async () => {
        const tooBig = `data:image/jpeg;base64,${'B'.repeat(charsFor(AI_ATTACHMENT_MAX_BYTES + 1024))}`
        const enc: ImageEncoder = {
            decode: vi.fn(async () => ({ width: 8000, height: 4000, source: {} as CanvasImageSource, close: vi.fn() })),
            encode: vi.fn(() => tooBig),
        }
        const { files, rejected } = await prepareChatFiles([png(charsFor(AI_ATTACHMENT_MAX_BYTES + 2048))], enc)
        expect(files).toEqual([])
        expect(rejected).toEqual([{ filename: 'shot.png', reason: 'too_large' }])
    })

    it('reports a canvas that refuses to encode as unsupported, not oversized', async () => {
        const enc: ImageEncoder = {
            decode: vi.fn(async () => ({ width: 800, height: 600, source: {} as CanvasImageSource, close: vi.fn() })),
            encode: vi.fn(() => null),
        }
        const heic: FileUIPart = { type: 'file', mediaType: 'image/heic', filename: 'IMG_3.heic', url: 'data:image/heic;base64,AAAA' }
        const { files, rejected } = await prepareChatFiles([heic], enc)
        expect(files).toEqual([])
        expect(rejected).toEqual([{ filename: 'IMG_3.heic', reason: 'unsupported' }])
    })

    it('keeps the original when re-encoding does not shrink it', async () => {
        const enc = encoderFor(4000, 2000, 5000)
        const file = png(1000)
        expect(await prepareChatFiles([file], enc)).toEqual({ files: [file], rejected: [] })
    })

    it('falls back to the original when a supported image fails to decode', async () => {
        const enc: ImageEncoder = { decode: vi.fn(async () => { throw new Error('bad image') }), encode: vi.fn() }
        const file = png(1000)
        expect(await prepareChatFiles([file], enc)).toEqual({ files: [file], rejected: [] })
    })

    it('rejects an undecodable format the model cannot read either', async () => {
        const enc: ImageEncoder = { decode: vi.fn(async () => { throw new Error('bad image') }), encode: vi.fn() }
        const heic: FileUIPart = { type: 'file', mediaType: 'image/heic', filename: 'IMG_2.heic', url: 'data:image/heic;base64,AAAA' }
        const { files, rejected } = await prepareChatFiles([heic], enc)
        expect(files).toEqual([])
        expect(rejected).toEqual([{ filename: 'IMG_2.heic', reason: 'unsupported' }])
    })
})
