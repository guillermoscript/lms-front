import type { FileUIPart } from 'ai'
import { isAllowedAttachmentMediaType } from '@/lib/ai/attachment-limits'

/**
 * Browser-side attachment logic shared by every AI chat. No React, no DOM
 * lookups beyond what image re-encoding needs, so it is unit-testable with a
 * stubbed canvas.
 */

export const IMAGE_MAX_EDGE_PX = 1600
export const IMAGE_JPEG_QUALITY = 0.85
/** Images already under this many encoded bytes are sent untouched. */
export const IMAGE_REENCODE_THRESHOLD_BYTES = 512 * 1024

export interface ChatSubmission {
    text?: string
    files?: FileUIPart[]
}

/** A turn needs either text or at least one attachment. */
export const hasSubmittableContent = (message: ChatSubmission): boolean =>
    Boolean(message.text?.trim()) || Boolean(message.files?.length)

export interface ImageEncoder {
    /** Decode a data URL into something with a width and height. */
    decode: (dataUrl: string) => Promise<{ width: number; height: number; source: CanvasImageSource; close?: () => void }>
    /** Draw the decoded source at the target size and return a data URL. */
    encode: (image: CanvasImageSource, width: number, height: number, mediaType: string, quality?: number) => string | null
}

const browserEncoder: ImageEncoder = {
    async decode(dataUrl) {
        const blob = await (await fetch(dataUrl)).blob()
        const bitmap = await createImageBitmap(blob)
        return { width: bitmap.width, height: bitmap.height, source: bitmap, close: () => bitmap.close() }
    },
    encode(image, width, height, mediaType, quality) {
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) return null
        ctx.drawImage(image, 0, 0, width, height)
        return canvas.toDataURL(mediaType, quality)
    },
}

/**
 * Downscale large photos before they go on the wire. `useChat` resends the
 * whole history as inline data URLs every turn, so a 5 MB phone photo would
 * ride along with every later message; ~1600px is plenty for the model.
 *
 * GIFs are left alone (canvas would flatten the animation), non-image and
 * non-data-URL parts pass through, and anything that fails to decode is sent
 * as-is — a worse upload beats a lost one.
 */
export async function prepareChatFiles(
    files: FileUIPart[] | undefined,
    encoder: ImageEncoder = browserEncoder
): Promise<FileUIPart[]> {
    if (!files?.length) return []
    return Promise.all(files.map((file) => downscaleImage(file, encoder)))
}

async function downscaleImage(file: FileUIPart, encoder: ImageEncoder): Promise<FileUIPart> {
    if (!file.url.startsWith('data:')) return file
    if (!isAllowedAttachmentMediaType(file.mediaType) || file.mediaType === 'image/gif') return file

    try {
        const image = await encoder.decode(file.url)
        const scale = Math.min(1, IMAGE_MAX_EDGE_PX / Math.max(image.width, image.height))
        // Small images are only re-encoded when they are heavy (e.g. uncompressed PNG screenshots).
        if (scale === 1 && file.url.length < IMAGE_REENCODE_THRESHOLD_BYTES) {
            image.close?.()
            return file
        }
        const keepPng = file.mediaType === 'image/png' && scale === 1
        const mediaType = keepPng ? 'image/png' : 'image/jpeg'
        const url = encoder.encode(
            image.source,
            Math.round(image.width * scale),
            Math.round(image.height * scale),
            mediaType,
            keepPng ? undefined : IMAGE_JPEG_QUALITY
        )
        image.close?.()
        // Re-encoding is not guaranteed to shrink; keep whichever is smaller.
        return url && url.length < file.url.length ? { ...file, url, mediaType } : file
    } catch {
        return file
    }
}
