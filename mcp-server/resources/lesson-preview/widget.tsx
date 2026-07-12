import {
  McpUseProvider,
  useWidget,
  useWidgetTheme,
  type WidgetMetadata,
} from "mcp-use/react";
import { z } from "zod";
import { Markdown } from "../shared/markdown";

// ── Schema ──────────────────────────────────────────────────────────────────

const lessonSchema = z.object({
  id: z.number(),
  title: z.string(),
  description: z.string().nullable(),
  video_url: z.string().nullable(),
  content: z.string().nullable(),
  status: z.string(),
  sequence: z.number(),
});

const resourceSchema = z.object({
  id: z.number(),
  file_name: z.string(),
  file_size: z.number().nullable(),
  mime_type: z.string().nullable(),
});

const propsSchema = z.object({
  lesson: lessonSchema,
  resources: z.array(resourceSchema),
});

export const widgetMetadata: WidgetMetadata = {
  description: "Display a lesson reading view with content, optional video, and attached resources",
  props: propsSchema,
  exposeAsTool: false,
  metadata: {
    invoking: "Loading lesson…",
    invoked: "Lesson loaded",
  },
};

type Props = z.infer<typeof propsSchema>;

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

function humanFileSize(bytes: number | null): string {
  if (bytes === null || bytes === 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit++;
  }
  return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
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

function humanMime(mimeType: string | null): string {
  if (!mimeType) return "File";
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

// ── Component ────────────────────────────────────────────────────────────────

export default function LessonPreview() {
  const { props, isPending } = useWidget<Props>();
  const theme = useWidgetTheme();

  const dark = theme === "dark";

  if (isPending) {
    return (
      <McpUseProvider autoSize>
        <div className={dark ? "dark" : ""}>
          <div className="bg-zinc-50 p-10 text-center font-sans text-zinc-400 dark:bg-zinc-950 dark:text-zinc-500">
            <div className="mx-auto mb-3 size-9 animate-spin rounded-full border-[3px] border-zinc-200 border-t-violet-600 dark:border-zinc-800 dark:border-t-violet-400" />
            <p className="m-0 text-sm">Loading lesson…</p>
          </div>
        </div>
      </McpUseProvider>
    );
  }

  const { lesson, resources } = props;

  return (
    <McpUseProvider autoSize>
      <div className={dark ? "dark" : ""}>
        <div className="mx-auto max-w-[760px] bg-zinc-50 p-6 font-sans dark:bg-zinc-950">
          {/* Lesson header */}
          <div className="mb-5">
            {/* Breadcrumb-ish sequence + status */}
            <div className="mb-2.5 flex items-center gap-2">
              <span className="rounded-lg bg-violet-50 px-2 py-0.5 text-[11px] font-bold text-violet-600 dark:bg-violet-950 dark:text-violet-400">
                Lesson {lesson.sequence}
              </span>
              <span
                className={`rounded-lg px-2 py-0.5 text-[11px] font-semibold ${statusPill(
                  lesson.status
                )}`}
              >
                {lesson.status}
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

          {/* Video link */}
          {lesson.video_url && (
            <div className="mb-5 flex items-center gap-2.5 rounded-[10px] border border-sky-200 bg-sky-50 px-4 py-3 dark:border-sky-900 dark:bg-sky-950">
              <span className="text-xl">▶️</span>
              <div>
                <div className="mb-0.5 text-xs font-semibold tracking-wider text-zinc-400 uppercase dark:text-zinc-500">
                  Video lesson
                </div>
                <a
                  href={lesson.video_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[13px] font-medium break-all text-sky-700 no-underline dark:text-sky-400"
                >
                  {lesson.video_url}
                </a>
              </div>
            </div>
          )}

          {/* Content reading pane */}
          {lesson.content ? (
            <div className="mb-5 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="mb-3 text-[11px] font-bold tracking-[0.06em] text-zinc-400 uppercase dark:text-zinc-500">
                Content (preview)
              </div>
              <Markdown content={lesson.content} dark={dark} fontSize={14} />
            </div>
          ) : (
            <div className="mb-5 rounded-xl border border-zinc-200 bg-white p-8 text-center text-[13px] text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-500">
              No written content for this lesson.
            </div>
          )}

          {/* Attached resources */}
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
              <span className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">
                Attached resources ({resources.length})
              </span>
            </div>

            {resources.length === 0 ? (
              <div className="p-6 text-center text-[13px] text-zinc-400 dark:text-zinc-500">
                No files attached to this lesson.
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
                        {humanMime(res.mime_type)}
                      </div>
                    </div>
                    <span className="shrink-0 text-xs text-zinc-400 tabular-nums dark:text-zinc-500">
                      {humanFileSize(res.file_size)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </McpUseProvider>
  );
}
