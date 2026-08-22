/**
 * Limits for images students attach in the AI chats (exercise coach, lesson
 * tutor, Aristotle). Shared by the client (PromptInput validation) and the
 * server (route sanitisation) so both sides agree on what is accepted.
 *
 * Images only: the routes run on gpt-4o-mini, which reads images but not
 * arbitrary documents, and a PDF in the message would fail the whole call.
 */
export const AI_ATTACHMENT_ACCEPT = 'image/*'
export const AI_ATTACHMENT_MAX_FILES = 4
/**
 * What may travel to the model, checked AFTER the browser downscales. The
 * server enforces the same number on the decoded bytes it receives.
 */
export const AI_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024 // 5 MB per image
/**
 * What the file picker accepts, checked BEFORE downscaling. Phone photos are
 * routinely 8-15 MB straight off the camera and shrink well under the wire
 * limit, so rejecting them at pick time would refuse the most common upload.
 */
export const AI_ATTACHMENT_MAX_UPLOAD_BYTES = 25 * 1024 * 1024
export const AI_ATTACHMENT_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const

export const isAllowedAttachmentMediaType = (mediaType: string | undefined): boolean =>
    !!mediaType && (AI_ATTACHMENT_MIME_TYPES as readonly string[]).includes(mediaType.toLowerCase())

/**
 * Approximate decoded size of a data URL without materialising it — base64 is
 * 4 chars per 3 bytes. Good enough to size-check an upload cheaply.
 */
export function approxDataUrlBytes(url: string): number {
    const comma = url.indexOf(',')
    return comma === -1 ? 0 : Math.floor(((url.length - comma - 1) * 3) / 4)
}
