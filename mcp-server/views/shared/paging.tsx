import { useState } from "react";
import { useDynamicTool } from "mcp-use/react";
import { useStrings } from "./i18n";

/**
 * Widget-side pagination.
 *
 * WHY THIS EXISTS
 *   Every list tool takes `limit`/`offset` (`PaginationSchema`, default 20) and
 *   reports an exact `count`, so the widgets could truthfully say "50 courses"
 *   while rendering 20 cards — and did. `has_more`/`next_offset` were computed
 *   for the markdown-returning tools and dropped on the floor by the
 *   widget-returning ones, so a reader who wanted rows 21–50 had no control to
 *   press and no hint that they were looking at a page rather than a list.
 *
 * HOW IT WORKS
 *   `widget({ props })` puts props on `structuredContent` (mcp-use
 *   `server/index.js`), so re-calling the widget's own tool with a higher
 *   `offset` returns the next page in exactly the shape the widget already
 *   renders. Pages are appended locally; the host is not asked to re-render the
 *   widget, so scroll position and every piece of local UI state survive.
 *
 * WHAT THE TOOL MUST SEND
 *   `offset`, `limit`, and `has_more` alongside the rows. `has_more` is
 *   authoritative; the `page.length === limit` fallback only covers a payload
 *   from an older server that predates these fields.
 */

export const PAGING_STRINGS = {
  en: {
    loadMore: "Load more",
    loadingMore: "Loading…",
    failed: "Could not load more.",
    retry: "Retry",
    shown: (shown: string, total: string) => `Showing ${shown} of ${total}`,
  },
  es: {
    loadMore: "Cargar más",
    loadingMore: "Cargando…",
    failed: "No se pudo cargar más.",
    retry: "Reintentar",
    shown: (shown: string, total: string) => `Mostrando ${shown} de ${total}`,
  },
};

/** The pagination fields a paginated widget's props carry. */
export interface PageProps {
  offset: number;
  limit: number;
  has_more: boolean;
}

export interface PagedItems<T> {
  /** First page from props plus every page loaded since. */
  items: T[];
  hasMore: boolean;
  loading: boolean;
  failed: boolean;
  loadMore: () => void;
}

/**
 * Append further pages of `itemsKey` by re-calling `toolName`.
 *
 * Safe to call before `isPending` clears: while props are empty the seed is an
 * empty list, and the seed is re-read on every render until the reader actually
 * loads a page, so the first page lands without an effect.
 */
export function usePagedItems<T>(config: {
  toolName: string;
  /** Prop holding the rows — also the key read back off `structuredContent`. */
  itemsKey: string;
  initialItems: T[] | undefined;
  page: Partial<PageProps> | undefined;
  /** Tool arguments that must be repeated on every page (ids, filters). */
  args?: Record<string, unknown>;
}): PagedItems<T> {
  // `useDynamicTool` rather than the typed `useCallTool`: the tool name arrives
  // as a prop string, not an exported ToolRef, so the contract is supplied here.
  const { callTool } = useDynamicTool<Record<string, unknown>, Record<string, unknown>>(
    config.toolName
  );

  const seedItems = config.initialItems ?? [];
  const seedOffset = config.page?.offset ?? 0;
  const seedLimit = config.page?.limit ?? 20;
  const seedHasMore = config.page?.has_more ?? false;

  const [extra, setExtra] = useState<T[]>([]);
  const [cursor, setCursor] = useState<{ offset: number; hasMore: boolean } | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  // Adjusting state when props change (React's own render-phase pattern): a
  // fresh first page — the host re-ran the tool — must discard pages appended
  // to the page it replaced, or the two would concatenate into a mixed list.
  const seedKey = `${seedOffset}:${seedItems.length}:${seedHasMore}`;
  const [seenKey, setSeenKey] = useState(seedKey);
  if (seedKey !== seenKey) {
    setSeenKey(seedKey);
    setExtra([]);
    setCursor(null);
    setFailed(false);
  }

  const nextOffset = cursor?.offset ?? seedOffset + seedItems.length;
  const hasMore = cursor?.hasMore ?? seedHasMore;

  const loadMore = () => {
    if (loading || !hasMore) return;
    setLoading(true);
    setFailed(false);
    void (async () => {
      try {
        // Throws (ToolError / transport) on failure — caught below as `failed`.
        const result = await callTool({
          ...(config.args ?? {}),
          limit: seedLimit,
          offset: nextOffset,
        });
        const body = result?.structuredContent as Record<string, unknown> | undefined;
        const rows = body?.[config.itemsKey];
        if (!Array.isArray(rows)) {
          // A result we cannot read is a failure, not the end of the list —
          // flipping hasMore off here would silently truncate.
          setFailed(true);
          return;
        }
        const page = rows as T[];
        setExtra((prev) => [...prev, ...page]);
        setCursor({
          offset: nextOffset + page.length,
          hasMore:
            typeof body?.has_more === "boolean"
              ? body.has_more
              : page.length === seedLimit,
        });
      } catch {
        setFailed(true);
      } finally {
        setLoading(false);
      }
    })();
  };

  return {
    items: extra.length > 0 ? [...seedItems, ...extra] : seedItems,
    hasMore,
    loading,
    failed,
    loadMore,
  };
}

/**
 * "Showing 20 of 50" plus the control that fetches the rest.
 *
 * Renders nothing once everything is on screen — a dead "Load more" and a
 * redundant "50 of 50" are both noise at the bottom of a complete list.
 */
export function LoadMore({
  shown,
  total,
  paged,
  formatNumber,
}: {
  shown: number;
  total: number;
  paged: Pick<PagedItems<unknown>, "hasMore" | "loading" | "failed" | "loadMore">;
  formatNumber: (n: number) => string;
}) {
  const t = useStrings(PAGING_STRINGS);
  if (!paged.hasMore && !paged.failed) return null;

  return (
    <div className="mt-3.5 flex flex-wrap items-center justify-center gap-3">
      <span className="text-[12.5px] text-zinc-500 dark:text-zinc-400">
        {t.shown(formatNumber(shown), formatNumber(total))}
      </span>
      <button
        type="button"
        onClick={paged.loadMore}
        disabled={paged.loading}
        className="cursor-pointer rounded-lg border border-zinc-200 bg-white px-3.5 py-1.5 text-[12.5px] font-semibold text-zinc-700 disabled:cursor-default disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
      >
        {paged.loading ? t.loadingMore : paged.failed ? t.retry : t.loadMore}
      </button>
      {paged.failed && (
        <span
          role="alert"
          className="text-[12.5px] text-red-700 dark:text-red-400"
        >
          {t.failed}
        </span>
      )}
    </div>
  );
}
