"use client";

import type { FileUIPart, UIMessage } from "ai";
import { IconPaperclip } from "@tabler/icons-react";
import { toast } from "sonner";
import {
    Attachment,
    AttachmentPreview,
    AttachmentRemove,
    Attachments,
} from "@/components/ai-elements/attachments";
import {
    PromptInputButton,
    usePromptInputAttachments,
    type PromptInputProps,
} from "@/components/ai-elements/prompt-input";
import {
    AI_ATTACHMENT_ACCEPT,
    AI_ATTACHMENT_MAX_BYTES,
    AI_ATTACHMENT_MAX_FILES,
    isAllowedAttachmentMediaType,
} from "@/lib/ai/attachment-limits";
import { cn } from "@/lib/utils";

/**
 * Shared attachment wiring for every AI chat (exercise coach, lesson tutor,
 * Aristotle, teacher preview). Spread `chatAttachmentInputProps` onto
 * `<PromptInput>`, drop `<ChatAttachmentsPreview />` above the textarea and
 * `<ChatAttachButton />` in the tools row, then pass `message.files` through
 * `prepareChatFiles` to `sendMessage`.
 */
export const chatAttachmentInputProps: Pick<
    PromptInputProps,
    "accept" | "multiple" | "maxFiles" | "maxFileSize" | "onError"
> = {
    accept: AI_ATTACHMENT_ACCEPT,
    multiple: true,
    maxFiles: AI_ATTACHMENT_MAX_FILES,
    maxFileSize: AI_ATTACHMENT_MAX_BYTES,
    onError: (err) => {
        const mb = Math.round(AI_ATTACHMENT_MAX_BYTES / (1024 * 1024));
        const messages: Record<typeof err.code, string> = {
            accept: "Only images (JPG, PNG, GIF, WebP) can be attached.",
            max_file_size: `Each image must be under ${mb} MB.`,
            max_files: `You can attach up to ${AI_ATTACHMENT_MAX_FILES} images per message.`,
        };
        toast.error(messages[err.code] ?? err.message);
    },
};

export function ChatAttachmentsPreview({ className }: { className?: string }) {
    const attachments = usePromptInputAttachments();
    if (attachments.files.length === 0) return null;

    return (
        <div className={cn("px-3 pt-2", className)}>
            <Attachments variant="inline">
                {attachments.files.map((attachment) => (
                    <Attachment
                        data={attachment}
                        key={attachment.id}
                        onRemove={() => attachments.remove(attachment.id)}
                    >
                        <AttachmentPreview />
                        <AttachmentRemove />
                    </Attachment>
                ))}
            </Attachments>
        </div>
    );
}

export function ChatAttachButton({
    label = "Attach image",
    disabled,
    className,
}: {
    label?: string;
    disabled?: boolean;
    className?: string;
}) {
    const attachments = usePromptInputAttachments();
    return (
        <PromptInputButton
            type="button"
            onClick={() => attachments.openFileDialog()}
            disabled={disabled}
            aria-label={label}
            title={label}
            className={className}
        >
            <IconPaperclip className="size-4" />
        </PromptInputButton>
    );
}

/** Renders the image parts of a message (user uploads or hydrated history). */
export function MessageImageParts({
    parts,
    className,
}: {
    parts: UIMessage["parts"];
    className?: string;
}) {
    const images = parts.filter(
        (part): part is FileUIPart =>
            part.type === "file" && isAllowedAttachmentMediaType(part.mediaType)
    );
    if (images.length === 0) return null;

    return (
        <div className={cn("flex flex-wrap gap-2 mb-2", className)}>
            {images.map((image, index) => (
                // eslint-disable-next-line @next/next/no-img-element -- data/signed URLs, not optimisable
                <img
                    key={`${image.url.slice(0, 64)}-${index}`}
                    src={image.url}
                    alt={image.filename ?? "Attached image"}
                    className="max-h-64 max-w-full rounded-lg border border-border object-contain"
                    loading="lazy"
                />
            ))}
        </div>
    );
}

const MAX_EDGE_PX = 1600;
const JPEG_QUALITY = 0.85;

/**
 * Downscale large photos before they go on the wire. `useChat` resends the
 * whole history as inline data URLs every turn, so a 5 MB phone photo would
 * ride along with every later message; ~1600px is plenty for the model.
 * GIFs are left alone (canvas would flatten the animation) and anything that
 * fails to decode is sent as-is.
 */
export async function prepareChatFiles(files: FileUIPart[] | undefined): Promise<FileUIPart[]> {
    if (!files?.length) return [];
    return Promise.all(
        files.map(async (file) => {
            if (!file.url.startsWith("data:") || file.mediaType === "image/gif") return file;
            if (!isAllowedAttachmentMediaType(file.mediaType)) return file;
            try {
                const bitmap = await createImageBitmap(await (await fetch(file.url)).blob());
                const scale = Math.min(1, MAX_EDGE_PX / Math.max(bitmap.width, bitmap.height));
                // Small images are only re-encoded when they are heavy (e.g. uncompressed PNG screenshots).
                if (scale === 1 && file.url.length < 512 * 1024) return file;
                const canvas = document.createElement("canvas");
                canvas.width = Math.round(bitmap.width * scale);
                canvas.height = Math.round(bitmap.height * scale);
                const ctx = canvas.getContext("2d");
                if (!ctx) return file;
                ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
                bitmap.close();
                const keepPng = file.mediaType === "image/png" && scale === 1;
                const mediaType = keepPng ? "image/png" : "image/jpeg";
                const url = canvas.toDataURL(mediaType, keepPng ? undefined : JPEG_QUALITY);
                // Re-encoding is not guaranteed to shrink; keep whichever is smaller.
                return url.length < file.url.length ? { ...file, url, mediaType } : file;
            } catch {
                return file;
            }
        })
    );
}
