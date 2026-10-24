import { useSendFollowUp, useToolContext, useViewTheme } from "mcp-use/react";
import { Brand } from "../shared/branding";
import { useFormat, useStrings } from "../shared/i18n";
import { LoadMore, usePagedItems } from "../shared/paging";
import { withWidgetBoundary } from "../shared/error-boundary";
import { ViewPending } from "../shared/view-pending";
import { Markdown } from "../shared/markdown";
import { type PostSummary, type Props } from "./schema";
import "virtual:mcp-use/tailwind.css";

// ── Strings ──────────────────────────────────────────────────────────────────

const STRINGS = {
  en: {
    loading: "Loading community feed…",
    titleSchool: "Community",
    titleCourse: "Course community",
    subtitle: (n: number, count: string) => `${count} post${n === 1 ? "" : "s"}`,
    emptyTitle: "No posts yet",
    emptyHint: "Questions and discussions from the community will appear here.",
    member: "A member",
    pinned: "Pinned",
    locked: "Locked",
    answered: "Answered",
    unanswered: "Unanswered",
    graded: "Graded",
    comments: (n: number, count: string) => `${count} comment${n === 1 ? "" : "s"}`,
    open: (title: string) => `Open post: ${title}`,
    untitled: "Untitled post",
    types: {
      standard: "Post",
      question: "Question",
      discussion_prompt: "Discussion",
      poll: "Poll",
      milestone: "Milestone",
    } as Record<string, string>,
    openPrompt: (id: string, title: string) =>
      `Open the community post "${title}" (id ${id}) with lms_get_community_post and show me its comments.`,
  },
  es: {
    loading: "Cargando la comunidad…",
    titleSchool: "Comunidad",
    titleCourse: "Comunidad del curso",
    subtitle: (n: number, count: string) => `${count} ${n === 1 ? "publicación" : "publicaciones"}`,
    emptyTitle: "Aún no hay publicaciones",
    emptyHint: "Las preguntas y debates de la comunidad aparecerán aquí.",
    member: "Un miembro",
    pinned: "Fijada",
    locked: "Cerrada",
    answered: "Respondida",
    unanswered: "Sin respuesta",
    graded: "Calificada",
    comments: (n: number, count: string) => `${count} ${n === 1 ? "comentario" : "comentarios"}`,
    open: (title: string) => `Abrir publicación: ${title}`,
    untitled: "Publicación sin título",
    types: {
      standard: "Publicación",
      question: "Pregunta",
      discussion_prompt: "Debate",
      poll: "Encuesta",
      milestone: "Logro",
    } as Record<string, string>,
    openPrompt: (id: string, title: string) =>
      `Abre la publicación de la comunidad «${title}» (id ${id}) con lms_get_community_post y muéstrame sus comentarios.`,
  },
};

const TYPE_BADGE: Record<string, string> = {
  standard: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  question: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-400",
  discussion_prompt:
    "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-400",
  poll: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  milestone: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
};

// ── Component ────────────────────────────────────────────────────────────────

function CommunityFeed() {
  const view = useToolContext();
  const dark = useViewTheme() === "dark";
  const sendFollowUp = useSendFollowUp();
  const t = useStrings(STRINGS);
  const fmt = useFormat();

  const props = view.status === "ready" ? (view.toolOutput as Props) : undefined;
  const paged = usePagedItems<PostSummary>({
    toolName: "lms_list_community_posts",
    itemsKey: "posts",
    initialItems: props?.posts,
    page: props,
    args: {
      ...(props?.course_id != null ? { course_id: props.course_id } : {}),
      ...(props?.lesson_id != null ? { lesson_id: props.lesson_id } : {}),
      ...(props?.post_type ? { post_type: props.post_type } : {}),
      ...(props?.questions ? { questions: props.questions } : {}),
    },
  });

  if (view.status !== "ready") {
    return (
      <>
        <Brand />
        <div className={dark ? "dark" : ""}>
          <ViewPending view={view} label={t.loading} />
        </div>
      </>
    );
  }

  const { scope } = props as Props;
  const posts = paged.items;
  const total = Math.max(props?.total ?? 0, posts.length);

  return (
    <>
      <Brand />
      <div className={dark ? "dark" : ""}>
        <div className="mx-auto max-w-[760px] bg-zinc-50 p-6 font-sans dark:bg-zinc-950">
          <div className="mb-[18px] flex flex-wrap items-baseline justify-between gap-2">
            <h1 className="m-0 text-[22px] font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
              {scope === "course" ? t.titleCourse : t.titleSchool}
            </h1>
            <span className="text-[13px] text-zinc-500 dark:text-zinc-400">
              {t.subtitle(total, fmt.number(total))}
            </span>
          </div>

          {posts.length === 0 ? (
            <div className="rounded-xl border border-zinc-200 bg-white p-10 text-center dark:border-zinc-800 dark:bg-zinc-900">
              <div aria-hidden="true" className="mb-2 text-3xl">
                💬
              </div>
              <p className="m-0 text-[15px] font-semibold text-zinc-900 dark:text-zinc-100">
                {t.emptyTitle}
              </p>
              <p className="mt-1.5 mb-0 text-[13px] text-zinc-400 dark:text-zinc-500">
                {t.emptyHint}
              </p>
            </div>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {posts.map((p) => {
                const label = p.title || p.excerpt.slice(0, 60) || t.untitled;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      aria-label={t.open(label)}
                      onClick={() =>
                        void sendFollowUp({ prompt: t.openPrompt(p.id, label) })
                      }
                      className="block w-full cursor-pointer rounded-xl border border-zinc-200 bg-white p-4 text-left font-[inherit] hover:border-[var(--brand-600)] dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-[var(--brand-400)]"
                    >
                      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            TYPE_BADGE[p.post_type] ?? TYPE_BADGE.standard
                          }`}
                        >
                          {t.types[p.post_type] ?? p.post_type}
                        </span>
                        {p.is_pinned && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-950 dark:text-amber-400">
                            <span aria-hidden="true">📌 </span>
                            {t.pinned}
                          </span>
                        )}
                        {p.answered === true && (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                            <span aria-hidden="true">✓ </span>
                            {t.answered}
                          </span>
                        )}
                        {p.answered === false && (
                          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                            {t.unanswered}
                          </span>
                        )}
                        {p.is_graded && (
                          <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700 dark:bg-violet-950 dark:text-violet-400">
                            {t.graded}
                          </span>
                        )}
                        {p.is_locked && (
                          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                            <span aria-hidden="true">🔒 </span>
                            {t.locked}
                          </span>
                        )}
                      </div>
                      {p.title && (
                        <div className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100">
                          {p.title}
                        </div>
                      )}
                      {p.excerpt && (
                        <div className="mt-1 text-[13px] text-zinc-500 dark:text-zinc-400">
                          <Markdown content={p.excerpt} dark={dark} fontSize={13} />
                        </div>
                      )}
                      <div className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                        {p.author_name ?? t.member} · {fmt.date(p.created_at)} ·{" "}
                        {t.comments(p.comment_count, fmt.number(p.comment_count))}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <LoadMore
            shown={posts.length}
            total={total}
            paged={paged}
            formatNumber={fmt.number}
          />
        </div>
      </div>
    </>
  );
}

export default withWidgetBoundary(CommunityFeed);
