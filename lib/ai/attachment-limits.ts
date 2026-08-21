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
export const AI_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024 // 5 MB per image
export const AI_ATTACHMENT_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const

export const isAllowedAttachmentMediaType = (mediaType: string | undefined): boolean =>
    !!mediaType && (AI_ATTACHMENT_MIME_TYPES as readonly string[]).includes(mediaType.toLowerCase())
