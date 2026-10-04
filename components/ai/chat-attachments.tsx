"use client";

import type { FileUIPart, UIMessage } from "ai";
import { IconPaperclip } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { toast } from "sonner";
import {
    Attachment,
    AttachmentPreview,
    AttachmentRemove,
    Attachments,
} from "@/components/ai-elements/attachments";
import {
    PromptInputButton,
    PromptInputHeader,
    usePromptInputAttachments,
    type PromptInputProps,
} from "@/components/ai-elements/prompt-input";
import {
    AI_ATTACHMENT_ACCEPT,
    AI_ATTACHMENT_MAX_FILES,
    AI_ATTACHMENT_MAX_UPLOAD_BYTES,
    isAllowedAttachmentMediaType,
} from "@/lib/ai/attachment-limits";
import { cn } from "@/lib/utils";

/**
 * Presentational attachment pieces for the AI chats. The behaviour lives in
 * `hooks/use-ai-chat-submit` and `lib/ai/attachments-client`; this file only
 * knows how to draw the button, the pending-file chips and the sent images.
 *
 * Usage: spread `useChatAttachmentInputProps()` onto `<PromptInput>`, put
 * `<ChatAttachmentsPreview />` first inside it, `<ChatAttachButton />` in the
 * tools row, and `<MessageImageParts parts={message.parts} />` in each bubble.
 */
type ChatAttachmentInputProps = Pick<
    PromptInputProps,
    "accept" | "multiple" | "maxFiles" | "maxFileSize" | "onError"
>;

/**
 * Picker constraints plus the toasts for what it turns away. The size ceiling
 * here is the pre-downscale one — a 12 MB phone photo is accepted and shrunk
 * by `prepareChatFiles` before it goes on the wire.
 */
export function useChatAttachmentInputProps(): ChatAttachmentInputProps {
    const t = useTranslations("components.aiAttachments");

    return useMemo(
        () => ({
            accept: AI_ATTACHMENT_ACCEPT,
            multiple: true,
            maxFiles: AI_ATTACHMENT_MAX_FILES,
            maxFileSize: AI_ATTACHMENT_MAX_UPLOAD_BYTES,
            onError: (err) => {
                const messages: Record<typeof err.code, string> = {
                    accept: t("errors.imagesOnly"),
                    max_file_size: t("errors.pickTooLarge", {
                        mb: Math.round(AI_ATTACHMENT_MAX_UPLOAD_BYTES / (1024 * 1024)),
                    }),
                    max_files: t("errors.tooMany", { count: AI_ATTACHMENT_MAX_FILES }),
                };
                toast.error(messages[err.code] ?? err.message);
            },
        }),
        [t]
    );
}

/** Chips for files picked but not yet sent; renders nothing when empty. */
export function ChatAttachmentsPreview({ className }: { className?: string }) {
    const attachments = usePromptInputAttachments();
    if (attachments.files.length === 0) return null;

    return (
        <PromptInputHeader className={className}>
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
        </PromptInputHeader>
    );
}

export function ChatAttachButton({
    label,
    disabled,
    className,
}: {
    label?: string;
    disabled?: boolean;
    className?: string;
}) {
    const t = useTranslations("components.aiAttachments");
    const attachments = usePromptInputAttachments();
    const title = label ?? t("attach");

    return (
        <PromptInputButton
            type="button"
            onClick={() => attachments.openFileDialog()}
            disabled={disabled}
            aria-label={title}
            title={title}
            className={className}
        >
            <IconPaperclip className="size-4" />
        </PromptInputButton>
    );
}

/**
 * Images inside a sent message (fresh data URLs or re-hydrated signed URLs).
 * Deliberately not the library's 96px `object-cover` thumbnail: students ask
 * "what is wrong in my screenshot", so the whole image has to stay legible.
 */
export function MessageImageParts({
    parts,
    className,
}: {
    parts: UIMessage["parts"];
    className?: string;
}) {
    const t = useTranslations("components.aiAttachments");
    const images = parts.filter(
        (part): part is FileUIPart =>
            part.type === "file" && isAllowedAttachmentMediaType(part.mediaType)
    );
    if (images.length === 0) return null;

    return (
        <div className={cn("mb-2 flex flex-wrap gap-2", className)}>
            {images.map((image, index) => (
                // eslint-disable-next-line @next/next/no-img-element -- data/signed URLs, not optimisable
                <img
                    key={`${image.url.slice(0, 64)}-${index}`}
                    src={image.url}
                    alt={image.filename ?? t("imageAlt")}
                    className="max-h-64 max-w-full rounded-lg border border-border object-contain"
                    loading="lazy"
                />
            ))}
        </div>
    );
}
