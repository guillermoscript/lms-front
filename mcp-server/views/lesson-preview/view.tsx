import { useToolContext, useViewTheme } from "mcp-use/react";
import { Brand } from "../shared/branding";
import { useFormat, useStrings } from "../shared/i18n";
import { withWidgetBoundary } from "../shared/error-boundary";
import { type Props } from "./schema";
import { LessonBody } from "../shared/lesson";
import "virtual:mcp-use/tailwind.css";

// ── Helpers ──────────────────────────────────────────────────────────────────

function statusPill(status: string): string {
  switch (status.toLowerCase()) {
    case "published":
      return "bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-400";
    case "draft":
      return "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400";
    default:
      return "bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400";
  }
}

/**
 * `1.5 MB` / `1,5 MB`. The unit abbreviations are the same in both languages;
 * the decimal separator is not, so the number goes through `Intl`.
 */
function humanFileSize(
  bytes: number | null,
  formatNumber: (n: number | null, opts?: Intl.NumberFormatOptions) => string
): string {
  if (bytes === null || bytes === 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit++;
  }
  const digits = unit === 0 ? 0 : 1;
  return `${formatNumber(size, { minimumFractionDigits: digits, maximumFractionDigits: digits })} ${units[unit]}`;
}

function fileIcon(mimeType: string | null): string {
  if (!mimeType) return "📎";
  if (mimeType.startsWith("image/")) return "🖼";
  if (mimeType.startsWith("video/")) return "🎬";
  if (mimeType.startsWith("audio/")) return "🎵";
  if (mimeType.includes("pdf")) return "📄";
  if (
    mimeType.includes("zip") ||
    mimeType.includes("tar") ||
    mimeType.includes("gzip")
  )
    return "🗜";
  if (
    mimeType.includes("word") ||
    mimeType.includes("document")
  )
    return "📝";
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel")) return "📊";
  if (mimeType.includes("presentation") || mimeType.includes("powerpoint")) return "📑";
  if (mimeType.includes("text")) return "📃";
  return "📎";
}

function humanMime(mimeType: string | null, fallback: string): string {
  // Format names ("PDF", "Word") are proper nouns — only the fallback varies.
  if (!mimeType) return fallback;
  const map: Record<string, string> = {
    "application/pdf": "PDF",
    "image/png": "PNG",
    "image/jpeg": "JPEG",
    "image/gif": "GIF",
    "image/webp": "WebP",
    "video/mp4": "MP4",
    "audio/mpeg": "MP3",
    "text/plain": "Text",
    "text/html": "HTML",
    "application/zip": "ZIP",
    "application/json": "JSON",
    "application/msword": "Word",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      "Word",
    "application/vnd.ms-excel": "Excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "Excel",
  };
  if (map[mimeType]) return map[mimeType];
  const parts = mimeType.split("/");
  return parts[parts.length - 1].toUpperCase().slice(0, 10);
}

// ── Strings ──────────────────────────────────────────────────────────────────

const STRINGS = {
  en: {
    loading: "Loading lesson…",
    lessonNumber: (n: string) => `Lesson ${n}`,
    status: { published: "Published", draft: "Draft", archived: "Archived" } as Record<
      string,
      string
    >,
    contentHeading: "Content (preview)",
    noContent: "No written content for this lesson.",
    resourcesHeading: (n: string) => `Attached resources (${n})`,
    noResources: "No files attached to this lesson.",
    /** Fallback label for a file whose MIME type we do not have a name for. */
    genericFile: "File",
  },
  es: {
    loading: "Cargando la lección…",
    lessonNumber: (n: string) => `Lección ${n}`,
    status: { published: "Publicada", draft: "Borrador", archived: "Archivada" } as Record<
      string,
      string
    >,
    contentHeading: "Contenido (vista previa)",
    noContent: "Esta lección no tiene contenido escrito.",
    resourcesHeading: (n: string) => `Recursos adjuntos (${n})`,
    noResources: "Esta lección no tiene archivos adjuntos.",
    genericFile: "Archivo",
  },
};

// ── Component ────────────────────────────────────────────────────────────────

function LessonPreview() {
  const view = useToolContext();
  const dark = useViewTheme() === "dark";
  const t = useStrings(STRINGS);
  const fmt = useFormat();

  // "pending" and "error" both render the loading branch, exactly like v1:
  // an isError result carries no structuredContent, and the transcript already
  // shows the tool's own error text.
  if (view.status !== "ready") {
    return (
      <>
        <Brand />
        <div className={dark ? "dark" : ""}>
          <div className="bg-zinc-50 p-10 text-center font-sans text-zinc-400 dark:bg-zinc-950 dark:text-zinc-500">
            <div className="mx-auto mb-3 size-9 animate-spin rounded-full border-[3px] border-zinc-200 border-t-[var(--brand-600)] dark:border-zinc-800 dark:border-t-[var(--brand-400)]" />
            <p className="m-0 text-sm">{t.loading}</p>
          </div>
        </div>
      </>
    );
  }

  const { lesson, resources } = view.toolOutput as Props;

  return (
    <>
      <Brand />
      <div className={dark ? "dark" : ""}>
        <div className="mx-auto max-w-[760px] bg-zinc-50 p-6 font-sans dark:bg-zinc-950">
          {/* Lesson header */}
          <div className="mb-5">
            {/* Breadcrumb-ish sequence + status */}
            <div className="mb-2.5 flex items-center gap-2">
              <span className="rounded-lg bg-[var(--brand-50)] px-2 py-0.5 text-[11px] font-bold text-[var(--brand-600)] dark:bg-[var(--brand-950)] dark:text-[var(--brand-400)]">
                {t.lessonNumber(fmt.number(lesson.sequence))}
              </span>
              <span
                className={`rounded-lg px-2 py-0.5 text-[11px] font-semibold ${statusPill(
                  lesson.status
                )}`}
              >
                {t.status[lesson.status.toLowerCase()] ?? lesson.status}
              </span>
            </div>

            <h1 className="m-0 text-2xl leading-tight font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
              {lesson.title}
            </h1>

            {lesson.description && (
              <p className="mt-2.5 mb-0 text-[15px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                {lesson.description}
              </p>
            )}
          </div>

          {/* Content preview — video, embed and MDX exactly as students see it */}
          <div className="mb-5">
            <div className="mb-3 text-[11px] font-bold tracking-[0.06em] text-zinc-400 uppercase dark:text-zinc-500">
              {t.contentHeading}
            </div>
            <LessonBody
              content={lesson.content}
              videoUrl={lesson.video_url}
              embedCode={lesson.embed_code}
              emptyMessage={t.noContent}
            />
          </div>

          {/* Attached resources */}
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
              <span className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">
                {t.resourcesHeading(fmt.number(resources.length))}
              </span>
            </div>

            {resources.length === 0 ? (
              <div className="p-6 text-center text-[13px] text-zinc-400 dark:text-zinc-500">
                {t.noResources}
              </div>
            ) : (
              <div>
                {resources.map((res, idx) => (
                  <div
                    key={res.id}
                    className={`flex items-center gap-3 px-4 py-[11px] transition-colors duration-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                      idx === resources.length - 1
                        ? ""
                        : "border-b border-zinc-200 dark:border-zinc-800"
                    }`}
                  >
                    <span className="shrink-0 text-xl">
                      {fileIcon(res.mime_type)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium text-zinc-900 dark:text-zinc-100">
                        {res.file_name}
                      </div>
                      <div className="mt-px text-[11px] text-zinc-400 dark:text-zinc-500">
                        {humanMime(res.mime_type, t.genericFile)}
                      </div>
                    </div>
                    <span className="shrink-0 text-xs text-zinc-400 tabular-nums dark:text-zinc-500">
                      {humanFileSize(res.file_size, fmt.number)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default withWidgetBoundary(LessonPreview);
