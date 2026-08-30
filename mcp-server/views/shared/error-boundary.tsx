import { Component, type ComponentType, type ReactNode } from "react";
import { useViewTheme } from "mcp-use/react";
import { Brand } from "./branding";
import { useStrings } from "./i18n";

/**
 * The last line of defence for a widget render.
 *
 * WHY THIS EXISTS
 *   A widget runs in an iframe with nothing above it. An uncaught render error
 *   does not fall back to the chat transcript — it blanks the frame, and the
 *   reader is left looking at an empty box with no way to tell a crash from a
 *   slow tool. The risk is not hypothetical: `shared/lesson/renderer.tsx` and
 *   `shared/markdown.tsx` walk mdast/MDX trees built from author-supplied
 *   content, so a lesson with an unexpected node shape takes the whole widget
 *   down.
 *
 * WHY IT WRAPS THE COMPONENT RATHER THAN THE CONTENT
 *   `withWidgetBoundary` sits outside the widget's own function, so it also
 *   covers the loading branch, the empty branch, and every early return — not
 *   just the one JSX tree a hand-placed `<ErrorBoundary>` happened to enclose.
 *   Each widget changes by two lines and keeps its markup untouched.
 *
 * WHAT IT DOES NOT DO
 *   It does not catch async failures — a rejected `callTool` never reaches
 *   an error boundary. Those stay the widget's own job (see `usePagedItems`,
 *   `submission-grader`), and that is the right split: a failed tool call is a
 *   state the widget can render around, a failed render is not.
 */

const STRINGS = {
  en: {
    title: "This view could not be displayed",
    body: "Something went wrong while rendering. The data is fine — ask again to retry.",
    retry: "Try again",
    details: "Technical details",
  },
  es: {
    title: "No se pudo mostrar esta vista",
    body: "Algo falló al renderizar. Los datos están bien: vuelve a pedirlo para reintentar.",
    retry: "Reintentar",
    details: "Detalles técnicos",
  },
};

interface FallbackStrings {
  title: string;
  body: string;
  retry: string;
  details: string;
}

interface BoundaryProps {
  children: ReactNode;
  dark: boolean;
  t: FallbackStrings;
}

interface BoundaryState {
  error: Error | null;
}

class WidgetErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    // The iframe console is the only place this is recoverable from.
    console.error("[widget] render failed:", error, info);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const { dark, t } = this.props;
    return (
      <>
        <Brand />
        <div className={dark ? "dark" : ""}>
          <div className="bg-zinc-50 p-8 font-sans dark:bg-zinc-950">
            <div
              role="alert"
              className="mx-auto max-w-[560px] rounded-xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-900 dark:bg-amber-950"
            >
              <p className="m-0 text-[15px] font-semibold text-amber-900 dark:text-amber-200">
                {t.title}
              </p>
              <p className="mt-1.5 mb-0 text-[13px] leading-relaxed text-amber-800 dark:text-amber-300">
                {t.body}
              </p>
              <div className="mt-3.5 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => this.setState({ error: null })}
                  className="cursor-pointer rounded-lg border border-amber-300 bg-white px-3.5 py-1.5 text-[13px] font-semibold text-amber-900 dark:border-amber-800 dark:bg-amber-900 dark:text-amber-100"
                >
                  {t.retry}
                </button>
              </div>
              {/* Collapsed: the message is for whoever is debugging, and an
                  unexplained stack in the middle of a lesson is just alarming. */}
              <details className="mt-3">
                <summary className="cursor-pointer text-[11.5px] text-amber-800 dark:text-amber-300">
                  {t.details}
                </summary>
                <pre className="mt-1.5 mb-0 overflow-x-auto text-[11px] leading-normal whitespace-pre-wrap text-amber-900 dark:text-amber-200">
                  {error.message}
                </pre>
              </details>
            </div>
          </div>
        </div>
      </>
    );
  }
}

/**
 * Wrap a widget's default export so a render error shows a themed, translated
 * card instead of an empty iframe.
 *
 * @example
 *   function MyWidget() { … }
 *   export default withWidgetBoundary(MyWidget);
 */
export function withWidgetBoundary<P extends object>(
  Widget: ComponentType<P>
): ComponentType<P> {
  function Guarded(props: P) {
    // Hooks live out here: a class component cannot read theme or locale, and
    // the fallback has to match the surrounding chat like every other view.
    const dark = useViewTheme() === "dark";
    const t = useStrings(STRINGS);
    return (
      <WidgetErrorBoundary dark={dark} t={t}>
        <Widget {...props} />
      </WidgetErrorBoundary>
    );
  }
  Guarded.displayName = `withWidgetBoundary(${Widget.displayName || Widget.name || "Widget"})`;
  return Guarded;
}
