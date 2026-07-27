import { getEmbedUrl, VideoFallbackLink } from "./components";
import { LessonMdxContent } from "./renderer";

export { LessonMdxContent } from "./renderer";
export { getEmbedUrl } from "./components";

/**
 * The lesson body, rendered the way the web app renders it
 * (`app/[locale]/dashboard/student/courses/[courseId]/lessons/[lessonId]/lesson-content.tsx`):
 * video first, then the custom embed when there is no video, then the MDX content.
 */
export function LessonBody({
  content,
  videoUrl,
  embedCode,
  emptyMessage = "No content for this lesson yet.",
}: {
  content: string | null;
  videoUrl?: string | null;
  embedCode?: string | null;
  emptyMessage?: string;
}) {
  const videoEmbedUrl = videoUrl ? getEmbedUrl(videoUrl) : null;
  const hasContent = Boolean(content && content.trim());

  if (!hasContent && !videoUrl && !embedCode) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 p-8 text-center text-[13px] text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-500">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {videoEmbedUrl && (
        <div>
          <div className="aspect-video w-full overflow-hidden rounded-xl bg-black ring-1 ring-zinc-200 dark:ring-zinc-800">
            <iframe
              src={videoEmbedUrl}
              title="Video"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="h-full w-full border-0"
            />
          </div>
          <VideoFallbackLink url={videoUrl as string} />
        </div>
      )}

      {/* Video URL we can not embed (not YouTube/Vimeo) — offer the link instead. */}
      {videoUrl && !videoEmbedUrl && (
        <div className="flex items-center gap-2.5 rounded-[10px] border border-sky-200 bg-sky-50 px-4 py-3 dark:border-sky-900 dark:bg-sky-950">
          <span className="text-xl">▶️</span>
          <div className="min-w-0">
            <div className="mb-0.5 text-xs font-semibold tracking-wider text-zinc-400 uppercase dark:text-zinc-500">
              Video lesson
            </div>
            <a
              href={videoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[13px] font-medium break-all text-sky-700 no-underline dark:text-sky-400"
            >
              {videoUrl}
            </a>
          </div>
        </div>
      )}

      {/* Teacher-authored embed HTML. Always sandboxed here: the widget host is
          not the tenant's own page, so the app's 'trusted' mode does not apply. */}
      {embedCode && !videoEmbedUrl && (
        <iframe
          srcDoc={`<style>html,body{margin:0;height:100%}</style>${embedCode}`}
          sandbox="allow-scripts allow-popups"
          title="Embedded content"
          className="aspect-video w-full overflow-hidden rounded-xl border-0"
        />
      )}

      {hasContent && <LessonMdxContent content={content as string} />}
    </div>
  );
}
