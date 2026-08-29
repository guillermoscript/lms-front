import { nanoid } from 'nanoid'
import { createAdminClient } from '@/lib/supabase/admin'
import {
    AI_ATTACHMENT_MAX_BYTES,
    AI_ATTACHMENT_MAX_FILES,
    approxDataUrlBytes,
    isAllowedAttachmentMediaType,
} from '@/lib/ai/attachment-limits'

export const AI_ATTACHMENT_BUCKET = 'ai-chat-attachments'
const SIGNED_URL_TTL_SECONDS = 60 * 60

/** What the message tables store in `attachments jsonb`. */
export interface StoredAttachment {
    path: string
    mediaType: string
    filename?: string
}

interface FilePartLike {
    type?: string
    url?: string
    mediaType?: string
    filename?: string
    text?: string
}

interface MessageLike {
    role?: string
    parts?: FilePartLike[]
}

const DATA_URL_RE = /^data:([^;,]+)(;base64)?,([\s\S]*)$/

function decodeDataUrl(url: string): { mediaType: string; bytes: Uint8Array } | null {
    const match = DATA_URL_RE.exec(url)
    if (!match) return null
    const [, mediaType, isBase64, payload] = match
    try {
        const bytes = isBase64
            ? Uint8Array.from(Buffer.from(payload, 'base64'))
            : new TextEncoder().encode(decodeURIComponent(payload))
        return { mediaType, bytes }
    } catch {
        return null
    }
}

/**
 * Strip anything from the LAST user message's file parts that the model must
 * not see: non-image media, oversized images, more than the allowed count, and
 * URLs that are neither data URLs (fresh upload) nor https (re-hydrated
 * history). Earlier messages are left alone — they came from the DB.
 *
 * The client enforces the same limits, but the body is user-controlled.
 */
export function sanitizeLastUserAttachments<T extends MessageLike>(messages: T[]): T[] {
    const lastIndex = messages.length - 1
    const last = messages[lastIndex] as MessageLike | undefined
    if (!last || last.role !== 'user' || !Array.isArray(last.parts)) return messages

    let kept = 0
    const parts = last.parts.filter((part) => {
        if (part.type !== 'file') return true
        const url = part.url ?? ''
        const mediaType = part.mediaType ?? (DATA_URL_RE.exec(url)?.[1] ?? '')
        if (!isAllowedAttachmentMediaType(mediaType)) return false
        if (url.startsWith('data:')) {
            if (approxDataUrlBytes(url) > AI_ATTACHMENT_MAX_BYTES) return false
        } else if (!url.startsWith('https://')) {
            return false
        }
        kept += 1
        return kept <= AI_ATTACHMENT_MAX_FILES
    })

    const next = messages.slice()
    next[lastIndex] = { ...last, parts } as T

    // Earlier turns re-hydrated from history carry signed URLs that expire; an
    // unreachable image URL fails the whole model call, so stand them down to
    // a text note. Fresh data URLs from this session are kept for context.
    for (let i = 0; i < lastIndex; i += 1) {
        const msg = next[i] as MessageLike | undefined
        if (msg?.role !== 'user' || !Array.isArray(msg.parts)) continue
        if (!msg.parts.some((p) => p.type === 'file' && !(p.url ?? '').startsWith('data:'))) continue
        next[i] = {
            ...msg,
            parts: msg.parts.map((p) =>
                p.type === 'file' && !(p.url ?? '').startsWith('data:')
                    ? { type: 'text', text: `[image attached earlier${p.filename ? `: ${p.filename}` : ''}]` }
                    : p
            ),
        } as T
    }
    return next
}

const extensionFor = (mediaType: string): string =>
    ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp' })[mediaType] ?? 'bin'

/**
 * Upload the data-URL image parts of the last user message to the private
 * attachments bucket so the conversation can be re-hydrated later. Returns the
 * storage references to persist alongside the message text. Never throws —
 * a failed upload must not fail the chat turn that carried it.
 */
export async function persistLastUserAttachments(
    messages: MessageLike[],
    scope: { tenantId: string; userId: string; kind: 'exercise' | 'lesson'; referenceId: string | number }
): Promise<StoredAttachment[]> {
    const last = messages[messages.length - 1]
    if (!last || last.role !== 'user' || !Array.isArray(last.parts)) return []

    const fileParts = last.parts.filter((p) => p.type === 'file' && typeof p.url === 'string' && p.url.startsWith('data:'))
    if (fileParts.length === 0) return []

    const admin = createAdminClient()
    const stored: StoredAttachment[] = []

    for (const part of fileParts) {
        const decoded = decodeDataUrl(part.url!)
        if (!decoded || !isAllowedAttachmentMediaType(decoded.mediaType)) continue
        if (decoded.bytes.byteLength > AI_ATTACHMENT_MAX_BYTES) continue

        const path = `${scope.tenantId}/${scope.userId}/${scope.kind}-${scope.referenceId}/${nanoid(12)}.${extensionFor(decoded.mediaType)}`
        const { error } = await admin.storage
            .from(AI_ATTACHMENT_BUCKET)
            .upload(path, decoded.bytes, { contentType: decoded.mediaType, upsert: false })
        if (error) {
            console.error('Failed to store AI chat attachment:', error)
            continue
        }
        stored.push({ path, mediaType: decoded.mediaType, filename: part.filename })
    }

    return stored
}

/**
 * Turn stored references back into UI file parts with short-lived signed URLs.
 * Used by the server pages that hydrate chat history.
 */
export async function signStoredAttachments(
    attachments: unknown
): Promise<Array<{ type: 'file'; url: string; mediaType: string; filename?: string }>> {
    if (!Array.isArray(attachments) || attachments.length === 0) return []
    const valid = attachments.filter(
        (a): a is StoredAttachment => !!a && typeof a === 'object' && typeof (a as StoredAttachment).path === 'string'
    )
    if (valid.length === 0) return []

    const admin = createAdminClient()
    const { data, error } = await admin.storage
        .from(AI_ATTACHMENT_BUCKET)
        .createSignedUrls(valid.map((a) => a.path), SIGNED_URL_TTL_SECONDS)
    if (error || !data) {
        console.error('Failed to sign AI chat attachments:', error)
        return []
    }

    return data.flatMap((entry, i) =>
        entry.signedUrl
            ? [{ type: 'file' as const, url: entry.signedUrl, mediaType: valid[i].mediaType, filename: valid[i].filename }]
            : []
    )
}

/** True when the last user message carries at least one image part. */
export function lastUserMessageHasAttachments(messages: MessageLike[]): boolean {
    const last = messages[messages.length - 1]
    return last?.role === 'user' && Array.isArray(last.parts) && last.parts.some((p) => p.type === 'file')
}
