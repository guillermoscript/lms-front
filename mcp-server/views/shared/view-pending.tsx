import { useStrings } from "./i18n";

/**
 * What a widget shows before its tool result is ready: a spinner while the
 * call is pending, or — when the tool answered `isError: true` or the host
 * cancelled it — the tool's own message instead of a spinner that never ends
 * (e.g. "not found" for content RLS now hides, or a lost course access).
 *
 * The tool's error text is already in the transcript for the model; this is
 * the reader's copy of it. Render inside the widget's `dark` wrapper.
 */

const STRINGS = {
  en: {
    errorTitle: "This could not be loaded",
    errorHint: "Ask again, or ask the assistant what went wrong.",
  },
  es: {
    errorTitle: "No se pudo cargar",
    errorHint: "Vuelve a pedirlo, o pregunta al asistente qué falló.",
  },
};

export function ViewPending({
  view,
  label,
}: {
  view: { status: string; error?: { message?: string } | undefined };
  label: string;
}) {
  const t = useStrings(STRINGS);

  if (view.status === "error") {
    const message = view.error?.message?.replace(/^Error:\s*/, "").trim();
    return (
      <div
        role="alert"
        className="bg-zinc-50 p-8 text-center font-sans dark:bg-zinc-950"
      >
        <p className="m-0 text-[15px] font-semibold text-zinc-900 dark:text-zinc-100">
          {t.errorTitle}
        </p>
        {message && (
          <p className="mx-auto mt-1.5 mb-0 max-w-[520px] text-[13px] text-zinc-600 dark:text-zinc-400">
            {message}
          </p>
        )}
        <p className="mt-2 mb-0 text-xs text-zinc-400 dark:text-zinc-500">{t.errorHint}</p>
      </div>
    );
  }

  return (
    <div
      role="status"
      className="bg-zinc-50 p-10 text-center font-sans text-zinc-400 dark:bg-zinc-950 dark:text-zinc-500"
    >
      <div className="mx-auto mb-3 size-9 animate-spin rounded-full border-[3px] border-zinc-200 border-t-[var(--brand-600)] motion-reduce:animate-none dark:border-zinc-800 dark:border-t-[var(--brand-400)]" />
      <p className="m-0 text-sm">{label}</p>
    </div>
  );
}
