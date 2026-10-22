import { BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";

/** Up to two initials from the meaningful words of a title ("De chat a asistente…" → "CA"). */
function initialsOf(title: string): string {
    const words = title
        .split(/\s+/)
        .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
        .filter((w) => w.length > 2);
    const picked = (words.length > 0 ? words : title.split(/\s+/)).slice(0, 2);
    return picked.map((w) => w.charAt(0).toUpperCase()).join("");
}

interface CourseCoverProps {
    title: string;
    thumbnailUrl: string | null;
    category?: string | null;
    className?: string;
}

/**
 * 16:9 course cover. Without an uploaded thumbnail it falls back to a quiet,
 * brand-tinted tile (hairline grid + title initials) built only from theme
 * tokens, so it follows each school's primary colour in light and dark.
 */
export function CourseCover({ title, thumbnailUrl, category, className }: CourseCoverProps) {
    if (thumbnailUrl) {
        return (
            <div className={cn("relative aspect-video w-full overflow-hidden bg-muted", className)}>
                <img src={thumbnailUrl} alt={title} width={640} height={360} className="h-full w-full object-cover" />
            </div>
        );
    }

    return (
        <div
            className={cn(
                "relative aspect-video w-full overflow-hidden bg-gradient-to-br from-primary/20 via-primary/10 to-primary/5",
                className
            )}
            role="img"
            aria-label={title}
        >
            <div
                aria-hidden="true"
                className="absolute inset-0 text-brand-text opacity-[0.07] [background-image:linear-gradient(to_right,currentColor_1px,transparent_1px),linear-gradient(to_bottom,currentColor_1px,transparent_1px)] [background-size:28px_28px]"
            />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-brand-text">
                <span aria-hidden="true" className="text-6xl font-bold tracking-tight opacity-30 select-none">
                    {initialsOf(title)}
                </span>
                {category && (
                    <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider opacity-70">
                        <BookOpen className="h-3 w-3" aria-hidden="true" />
                        {category}
                    </span>
                )}
            </div>
        </div>
    );
}
