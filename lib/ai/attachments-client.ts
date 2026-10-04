import type { FileUIPart } from 'ai'
import {
    AI_ATTACHMENT_MAX_BYTES,
    approxDataUrlBytes,
    isAllowedAttachmentMediaType,
} from '@/lib/ai/attachment-limits'

/**
 * Browser-side attachment logic shared by every AI chat. No React, no DOM
 * lookups beyond what image re-encoding needs, so it is unit-testable with a
 * stubbed canvas.
 */

export const IMAGE_MAX_EDGE_PX = 1600
export const IMAGE_JPEG_QUALITY = 0.85
/** Images already under this many encoded bytes are sent untouched. */
export const IMAGE_REENCODE_THRESHOLD_BYTES = 512 * 1024
/**
 * Successively smaller edges tried until the encoded image fits the wire
 * limit. A 48 MP panorama can still exceed 5 MB at 1600px of JPEG.
 */
export const IMAGE_RESIZE_LADDER_PX = [IMAGE_MAX_EDGE_PX, 1200, 900, 700] as const

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
        const url = canvas.toDataURL(mediaType, quality)
        // Safari returns a PNG data URL when asked for a type it cannot encode.
        return url.startsWith(`data:${mediaType}`) ? url : null
    },
}

/** Why a file never made it onto the wire, so the caller can say so out loud. */
export type AttachmentRejection = 'unsupported' | 'too_large'

export interface RejectedAttachment {
    filename?: string
    reason: AttachmentRejection
}

export interface PreparedChatFiles {
    files: FileUIPart[]
    rejected: RejectedAttachment[]
}

/**
 * Get attachments ready for the wire: transcode what the model cannot read
 * (an iPhone HEIC, an AVIF screenshot) into JPEG, downscale large photos, and
 * report anything that still cannot travel.
 *
 * Downscaling matters because `useChat` resends the whole history as inline
 * data URLs every turn, so a 5 MB phone photo would ride along with every
 * later message; ~1600px is plenty for the model.
 */
export async function prepareChatFiles(
    files: FileUIPart[] | undefined,
    encoder: ImageEncoder = browserEncoder
): Promise<PreparedChatFiles> {
    if (!files?.length) return { files: [], rejected: [] }
    const results = await Promise.all(files.map((file) => prepareFile(file, encoder)))

    return results.reduce<PreparedChatFiles>(
        (acc, result, index) => {
            if ('file' in result) acc.files.push(result.file)
            else acc.rejected.push({ filename: files[index].filename, reason: result.rejected })
            return acc
        },
        { files: [], rejected: [] }
    )
}

type Prepared = { file: FileUIPart } | { rejected: AttachmentRejection }

async function prepareFile(file: FileUIPart, encoder: ImageEncoder): Promise<Prepared> {
    // Not a fresh upload — a signed URL from re-hydrated history. Leave it alone.
    if (!file.url.startsWith('data:')) return { file }
    if (!file.mediaType?.toLowerCase().startsWith('image/')) return { rejected: 'unsupported' }

    const isSupported = isAllowedAttachmentMediaType(file.mediaType)
    const fitsUntouched = () =>
        approxDataUrlBytes(file.url) <= AI_ATTACHMENT_MAX_BYTES
            ? ({ file } as Prepared)
            : ({ rejected: 'too_large' } as Prepared)

    // A canvas round-trip would flatten the animation, so GIFs travel as-is or not at all.
    if (file.mediaType === 'image/gif') return fitsUntouched()

    let image: Awaited<ReturnType<ImageEncoder['decode']>>
    try {
        image = await encoder.decode(file.url)
    } catch {
        // A format the browser cannot decode can never become JPEG here, and the
        // model reads none of them — say so instead of dropping it server-side in silence.
        return isSupported ? fitsUntouched() : { rejected: 'unsupported' }
    }

    try {
        const originalBytes = approxDataUrlBytes(file.url)
        const originalTravels = isSupported && originalBytes <= AI_ATTACHMENT_MAX_BYTES
        const longestEdge = Math.max(image.width, image.height)

        // Small, light and already in a format the model reads: nothing to gain.
        if (originalTravels && longestEdge <= IMAGE_MAX_EDGE_PX && file.url.length < IMAGE_REENCODE_THRESHOLD_BYTES) {
            return { file }
        }

        let encodeFailed = false
        for (const maxEdge of IMAGE_RESIZE_LADDER_PX) {
            const scale = Math.min(1, maxEdge / longestEdge)
            // A PNG being re-encoded rather than resized keeps its lossless format.
            const keepPng = file.mediaType === 'image/png' && scale === 1
            const mediaType = keepPng ? 'image/png' : 'image/jpeg'
            const url = encoder.encode(
                image.source,
                Math.round(image.width * scale),
                Math.round(image.height * scale),
                mediaType,
                keepPng ? undefined : IMAGE_JPEG_QUALITY
            )
            if (!url) {
                encodeFailed = true
                break
            }
            if (approxDataUrlBytes(url) > AI_ATTACHMENT_MAX_BYTES) continue
            // Re-encoding is not guaranteed to shrink; keep whichever is smaller.
            return { file: originalTravels && originalBytes <= approxDataUrlBytes(url) ? file : { ...file, url, mediaType } }
        }

        // A format the canvas refused to encode is unreadable, not merely oversized.
        return originalTravels ? { file } : { rejected: encodeFailed ? 'unsupported' : 'too_large' }
    } finally {
        image.close?.()
    }
}
