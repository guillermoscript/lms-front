import { useMemo, useRef, useState } from "react";
import {
  IconAlertCircle,
  IconAlertTriangle,
  IconArrowsExchange,
  IconBook,
  IconBulb,
  IconCheck,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconCircleCheck,
  IconCopy,
  IconEye,
  IconEyeOff,
  IconFile,
  IconFileDownload,
  IconFlag,
  IconInfo,
  IconPlayerPause,
  IconRefresh,
  IconVolume,
  IconX,
} from "./icons";

/**
 * Widget port of `components/lesson/*` — the MDX component map the web app
 * hands to `<MDXClient>`. Same components, same props, same behaviour; the
 * app's semantic Tailwind tokens are mapped onto the widget palette (zinc /
 * violet) because widgets do not load the tenant theme stylesheet.
 *
 * Props arrive from parsed MDX, so every component coerces defensively: a
 * malformed authored prop must degrade, never blank the lesson.
 */

// ── Prop coercion ────────────────────────────────────────────────────────────

const str = (value: unknown, fallback = ""): string =>
  typeof value === "string"
    ? value
    : typeof value === "number" || typeof value === "boolean"
      ? String(value)
      : fallback;

const arr = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

const num = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
};

const bool = (value: unknown): boolean => value === true || value === "true";

const cn = (...parts: (string | false | null | undefined)[]) =>
  parts.filter(Boolean).join(" ");

// ── Shared chrome ────────────────────────────────────────────────────────────

const CARD =
  "my-5 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900";
const PRIMARY_BUTTON =
  "cursor-pointer rounded-lg border-none bg-[var(--brand-600)] px-4 py-2 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[var(--brand-500)]";
const GHOST_BUTTON =
  "flex cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-200 bg-transparent px-3 py-2 text-[13px] font-medium text-zinc-600 dark:border-zinc-700 dark:text-zinc-300";

function Verdict({ correct, onRetry }: { correct: boolean; onRetry: () => void }) {
  return (
    <>
      <div
        role="status"
        aria-live="polite"
        className={cn(
          "flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-semibold",
          correct
            ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100"
            : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100"
        )}
      >
        {correct ? <IconCheck className="size-4" /> : <IconX className="size-4" />}
        {correct ? "Correct!" : "Incorrect"}
      </div>
      <button type="button" onClick={onRetry} className={GHOST_BUTTON}>
        <IconRefresh className="size-4" />
        Try again
      </button>
    </>
  );
}

function Explanation({ text }: { text: string }) {
  if (!text) return null;
  return (
    <p className="mt-4 mb-0 rounded-lg bg-zinc-100 p-3 text-[13px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
      {text}
    </p>
  );
}

// ── Callouts ─────────────────────────────────────────────────────────────────

const CALLOUT_VARIANTS = {
  info: {
    Icon: IconInfo,
    className:
      "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-100",
    defaultTitle: "Information",
  },
  warning: {
    Icon: IconAlertTriangle,
    className:
      "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100",
    defaultTitle: "Warning",
  },
  tip: {
    Icon: IconBulb,
    className:
      "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100",
    defaultTitle: "Tip",
  },
  success: {
    Icon: IconCircleCheck,
    className:
      "border-green-200 bg-green-50 text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-100",
    defaultTitle: "Correct",
  },
  danger: {
    Icon: IconAlertCircle,
    className:
      "border-red-200 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100",
    defaultTitle: "Important",
  },
} as const;

type CalloutType = keyof typeof CALLOUT_VARIANTS;

export function Callout({ type, title, children }: Record<string, any>) {
  const key = (str(type, "info") as CalloutType) in CALLOUT_VARIANTS
    ? (str(type, "info") as CalloutType)
    : "info";
  const variant = CALLOUT_VARIANTS[key];
  const heading = str(title) || variant.defaultTitle;

  return (
    <div role="note" className={cn("my-4 flex gap-3 rounded-xl border p-4", variant.className)}>
      <variant.Icon className="mt-0.5 size-5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="m-0 text-[13px] font-semibold">{heading}</p>
        <div className="mt-1 text-[13px] leading-relaxed [&>p:last-child]:mb-0 [&>p]:mb-2">
          {children}
        </div>
      </div>
    </div>
  );
}

export const Info = (props: Record<string, any>) => <Callout {...props} type="info" />;
export const Warning = (props: Record<string, any>) => <Callout {...props} type="warning" />;
export const Tip = (props: Record<string, any>) => <Callout {...props} type="tip" />;
export const Success = (props: Record<string, any>) => <Callout {...props} type="success" />;
export const Danger = (props: Record<string, any>) => <Callout {...props} type="danger" />;

// ── Spoilers ─────────────────────────────────────────────────────────────────

export function Spoiler({ title, label, defaultOpen, children }: Record<string, any>) {
  const [open, setOpen] = useState(bool(defaultOpen));
  // The block editor serializes the authored text as `label`; hand-written MDX
  // and the app's own component use `title`. Accept both.
  const heading = str(title) || str(label) || "Show answer";

  return (
    <div className="my-4 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900/50">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center justify-between gap-2 border-none bg-transparent px-4 py-3 text-left text-[13px] font-medium text-zinc-600 dark:text-zinc-300"
      >
        <span className="flex items-center gap-2">
          {open ? <IconEyeOff className="size-4" /> : <IconEye className="size-4" />}
          {heading}
        </span>
        <IconChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="border-t border-dashed border-zinc-300 px-4 py-3 text-[13px] dark:border-zinc-700 [&>p:last-child]:mb-0">
          {children}
        </div>
      )}
    </div>
  );
}

export const Solution = (props: Record<string, any>) => (
  <Spoiler title="Show solution" {...props} />
);
export const Hint = (props: Record<string, any>) => <Spoiler title="Show hint" {...props} />;
export const Answer = (props: Record<string, any>) => <Spoiler title="Show answer" {...props} />;

// ── Quiz ─────────────────────────────────────────────────────────────────────

export function Quiz({
  question,
  options,
  correct,
  correctIndex,
  explanation,
  multiple,
}: Record<string, any>) {
  const [selected, setSelected] = useState<number[]>([]);
  const [submitted, setSubmitted] = useState(false);

  const normalized = arr<string | { text?: string; explanation?: string }>(options).map(
    (option) => (typeof option === "string" ? { text: option } : option ?? {})
  );

  const resolved = correct ?? correctIndex;
  const correctAnswers = Array.isArray(resolved)
    ? resolved.map((value) => num(value)).filter((value): value is number => value !== undefined)
    : num(resolved) !== undefined
      ? [num(resolved) as number]
      : [];
  const allowMultiple = bool(multiple) || correctAnswers.length > 1;

  if (normalized.length === 0) return null;

  const toggle = (index: number) => {
    if (submitted) return;
    setSelected((previous) =>
      allowMultiple
        ? previous.includes(index)
          ? previous.filter((value) => value !== index)
          : [...previous, index]
        : [index]
    );
  };

  const isCorrect =
    submitted &&
    correctAnswers.length > 0 &&
    selected.length === correctAnswers.length &&
    selected.every((value) => correctAnswers.includes(value));

  return (
    <div className={CARD} role="group">
      <p className="mt-0 mb-4 text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">
        {str(question)}
      </p>

      <div className="space-y-2">
        {normalized.map((option, index) => {
          const isSelected = selected.includes(index);
          const isCorrectOption = correctAnswers.includes(index);
          const showResult = submitted && correctAnswers.length > 0;

          return (
            <button
              key={index}
              type="button"
              onClick={() => toggle(index)}
              disabled={submitted}
              aria-pressed={isSelected}
              className={cn(
                "flex w-full items-start gap-3 rounded-lg border border-zinc-200 bg-transparent p-3 text-left text-[13px] text-zinc-700 dark:border-zinc-700 dark:text-zinc-200",
                submitted ? "cursor-default" : "cursor-pointer",
                isSelected && !submitted && "border-[var(--brand-500)] bg-[var(--brand-50)] dark:bg-[var(--brand-950)]/40",
                showResult && isCorrectOption && "border-green-500 bg-green-50 dark:bg-green-950",
                showResult &&
                  isSelected &&
                  !isCorrectOption &&
                  "border-red-500 bg-red-50 dark:bg-red-950"
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex size-5 shrink-0 items-center justify-center border border-zinc-300 text-[11px] font-semibold dark:border-zinc-600",
                  allowMultiple ? "rounded" : "rounded-full",
                  isSelected && !submitted && "border-[var(--brand-600)] bg-[var(--brand-600)] text-white",
                  showResult && isCorrectOption && "border-green-500 bg-green-500 text-white",
                  showResult &&
                    isSelected &&
                    !isCorrectOption &&
                    "border-red-500 bg-red-500 text-white"
                )}
              >
                {showResult && isCorrectOption ? (
                  <IconCheck className="size-3" />
                ) : showResult && isSelected && !isCorrectOption ? (
                  <IconX className="size-3" />
                ) : (
                  String.fromCharCode(65 + index)
                )}
              </span>
              <span className="flex-1">
                {str(option.text)}
                {showResult && option.explanation && (
                  <span className="mt-1 block text-[11px] text-zinc-500 dark:text-zinc-400">
                    {str(option.explanation)}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {!submitted ? (
          <button
            type="button"
            onClick={() => setSubmitted(true)}
            disabled={selected.length === 0 && correctAnswers.length > 0}
            className={PRIMARY_BUTTON}
          >
            Check
          </button>
        ) : (
          <Verdict
            correct={isCorrect}
            onRetry={() => {
              setSelected([]);
              setSubmitted(false);
            }}
          />
        )}
      </div>

      {submitted && <Explanation text={str(explanation)} />}
    </div>
  );
}

// ── Code ─────────────────────────────────────────────────────────────────────

export function CodeBlock({
  children,
  code: codeProp,
  language,
  filename,
  title,
  showLineNumbers,
  highlightLines,
}: Record<string, any>) {
  const [copied, setCopied] = useState(false);
  // `code` is what `inlineCodeBlockBodies()` hands us: a snippet that would
  // have broken the document if it had stayed in the children position.
  const code = (typeof codeProp === "string" ? codeProp : str(children)).replace(/\n$/, "");
  const highlighted = arr<number>(highlightLines);

  // Fenced blocks carry the name in `title="…"` meta, so JSX blocks written the
  // same way should label themselves the same way.
  const label = str(filename) || str(title);

  const copy = () => {
    // Clipboard access can be denied inside the widget sandbox — the button
    // simply does nothing there rather than throwing.
    void navigator.clipboard
      ?.writeText(code)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => undefined);
  };

  return (
    <div className="my-4 overflow-hidden rounded-xl border border-zinc-800 bg-[#0d1117]">
      <div className="flex items-center justify-between border-b border-zinc-700 bg-[#161b22] px-4 py-2">
        <div className="flex items-center gap-2 text-[11px] text-zinc-400">
          {label ? (
            <>
              <IconFile className="size-4" />
              <span>{label}</span>
            </>
          ) : (
            <span className="uppercase">{str(language) || "Code"}</span>
          )}
        </div>
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? "Copied" : "Copy code"}
          className="flex cursor-pointer items-center gap-1.5 rounded border-none bg-transparent px-2 py-1 text-[11px] text-zinc-400"
        >
          {copied ? (
            <>
              <IconCheck className="size-4 text-green-400" />
              <span>Copied</span>
            </>
          ) : (
            <>
              <IconCopy className="size-4" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      <div className="overflow-x-auto p-4">
        <pre className="m-0 font-mono text-[12.5px] leading-relaxed text-zinc-300">
          <code>
            {bool(showLineNumbers)
              ? code.split("\n").map((line, index) => (
                  <div
                    key={index}
                    className={cn("flex", highlighted.includes(index + 1) && "bg-yellow-500/10")}
                  >
                    <span className="mr-4 inline-block w-8 shrink-0 text-right text-zinc-600 select-none">
                      {index + 1}
                    </span>
                    <span>{line || " "}</span>
                  </div>
                ))
              : code}
          </code>
        </pre>
      </div>
    </div>
  );
}

export function InlineCode({ children }: Record<string, any>) {
  return (
    <code className="rounded-md border border-zinc-200 bg-zinc-100 px-1.5 py-0.5 font-mono text-[0.9em] text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
      {children}
    </code>
  );
}

// ── Vocabulary ───────────────────────────────────────────────────────────────

export function Vocabulary({
  word,
  translation,
  pronunciation,
  audio,
  audioUrl,
  example,
  exampleTranslation,
  image,
}: Record<string, any>) {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  // `audioUrl` is what the block editor serializes; `audio` is the app's prop.
  const audioSrc = str(audio) || str(audioUrl);

  const toggle = () => {
    const element = audioRef.current;
    if (!element) return;
    if (playing) {
      element.pause();
      element.currentTime = 0;
    } else {
      void element.play().catch(() => undefined);
    }
  };

  return (
    <div className={cn(CARD, "flex gap-4")}>
      {image && (
        <img
          src={str(image)}
          alt={str(word)}
          className="size-20 shrink-0 rounded-lg object-cover"
        />
      )}

      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-base font-bold text-zinc-900 dark:text-zinc-100">
            {str(word)}
          </span>

          {audioSrc && (
            <>
              <audio
                ref={audioRef}
                src={audioSrc}
                preload="none"
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onEnded={() => setPlaying(false)}
              />
              <button
                type="button"
                onClick={toggle}
                aria-label={playing ? "Pause audio" : "Play pronunciation"}
                className="flex size-8 cursor-pointer items-center justify-center rounded-full border-none bg-[var(--brand-100)] text-[var(--brand-700)] dark:bg-[var(--brand-950)] dark:text-[var(--brand-300)]"
              >
                {playing ? (
                  <IconPlayerPause className="size-4" />
                ) : (
                  <IconVolume className="size-4" />
                )}
              </button>
            </>
          )}

          {pronunciation && (
            <span className="text-[13px] text-zinc-500 dark:text-zinc-400">
              /{str(pronunciation)}/
            </span>
          )}
        </div>

        {translation && (
          <p className="m-0 text-[13px] font-medium text-zinc-500 dark:text-zinc-400">
            {str(translation)}
          </p>
        )}

        {example && (
          <div className="mt-3 rounded-lg bg-zinc-100 p-3 dark:bg-zinc-800">
            <p className="m-0 text-[13px] text-zinc-700 italic dark:text-zinc-200">
              “{str(example)}”
            </p>
            {exampleTranslation && (
              <p className="mt-1 mb-0 text-[11px] text-zinc-500 dark:text-zinc-400">
                {str(exampleTranslation)}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Steps ────────────────────────────────────────────────────────────────────

export function Steps({ children }: Record<string, any>) {
  return (
    <div className="my-6 ml-4 space-y-6 border-l-2 border-zinc-200 pl-6 dark:border-zinc-700">
      {children}
    </div>
  );
}

/**
 * `number` is assigned by the renderer from the step's position inside <Steps>.
 * The app derives it from a module-level counter bumped during render, which
 * double-counts under React's development double-invoke (steps come out 1, 3,
 * 5…) — position is the only stable source.
 */
export function Step({ title, number, children }: Record<string, any>) {
  const assigned = num(number);

  return (
    <div className="relative">
      <div className="absolute -left-[calc(1.5rem+1px)] flex size-8 -translate-x-1/2 items-center justify-center rounded-full border-2 border-[var(--brand-600)] bg-white text-[13px] font-bold text-[var(--brand-600)] dark:border-[var(--brand-400)] dark:bg-zinc-950 dark:text-[var(--brand-400)]">
        {assigned ?? "•"}
      </div>
      <div className="pt-0.5">
        {title && (
          <h4 className="mt-0 mb-2 text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">
            {str(title)}
          </h4>
        )}
        <div className="text-[13px] text-zinc-600 dark:text-zinc-400 [&>p:last-child]:mb-0 [&>p]:mb-2">
          {children}
        </div>
      </div>
    </div>
  );
}

// ── Definitions ──────────────────────────────────────────────────────────────

export function Definition({
  term,
  pronunciation,
  partOfSpeech,
  children,
}: Record<string, any>) {
  return (
    <div className="my-4 rounded-lg border-l-4 border-[var(--brand-600)] bg-zinc-100/60 p-4 dark:border-[var(--brand-400)] dark:bg-zinc-800/50">
      <div className="flex items-start gap-3">
        <IconBook className="mt-0.5 size-5 shrink-0 text-[var(--brand-600)] dark:text-[var(--brand-400)]" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-[15px] font-bold text-zinc-900 dark:text-zinc-100">
              {str(term)}
            </span>
            {pronunciation && (
              <span className="text-[13px] text-zinc-500 dark:text-zinc-400">
                /{str(pronunciation)}/
              </span>
            )}
            {partOfSpeech && (
              <span className="rounded bg-zinc-200 px-1.5 py-0.5 text-[11px] text-zinc-600 italic dark:bg-zinc-700 dark:text-zinc-300">
                {str(partOfSpeech)}
              </span>
            )}
          </div>
          <div className="mt-2 text-[13px] text-zinc-700 dark:text-zinc-300 [&>p:last-child]:mb-0 [&>p]:mb-2">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

export function Glossary({ items, children }: Record<string, any>) {
  const entries = arr<Record<string, unknown>>(items);
  if (entries.length === 0) return <div className="space-y-3">{children}</div>;

  return (
    <div className="space-y-3">
      {entries.map((entry, index) => (
        <Definition
          key={index}
          term={entry.term}
          pronunciation={entry.pronunciation}
          partOfSpeech={entry.partOfSpeech}
        >
          {str(entry.definition)}
        </Definition>
      ))}
    </div>
  );
}

// ── Comparisons ──────────────────────────────────────────────────────────────

const HIGHLIGHTS = {
  positive:
    "border-green-200 bg-green-50/60 dark:border-green-800 dark:bg-green-950/50",
  negative: "border-red-200 bg-red-50/60 dark:border-red-800 dark:bg-red-950/50",
  neutral: "border-zinc-200 bg-zinc-50/60 dark:border-zinc-700 dark:bg-zinc-900/50",
} as const;

type Highlight = keyof typeof HIGHLIGHTS;

function ComparePane({
  title,
  highlight,
  children,
}: {
  title: string;
  highlight: Highlight;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("rounded-xl border p-4", HIGHLIGHTS[highlight])}>
      <h4 className="mt-0 mb-3 flex items-center gap-2 text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">
        {highlight === "negative" && <span className="text-red-500">✗</span>}
        {highlight === "positive" && <span className="text-green-500">✓</span>}
        {title}
      </h4>
      <div className="text-[13px] text-zinc-700 dark:text-zinc-300 [&>p:last-child]:mb-0 [&>p]:mb-2">
        {children}
      </div>
    </div>
  );
}

function highlightOf(value: unknown): Highlight {
  const key = str(value, "neutral");
  return key in HIGHLIGHTS ? (key as Highlight) : "neutral";
}

export function Compare({ left, right }: Record<string, any>) {
  const leftSide = (left ?? {}) as Record<string, unknown>;
  const rightSide = (right ?? {}) as Record<string, unknown>;

  return (
    <div className="my-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <ComparePane title={str(leftSide.title)} highlight={highlightOf(leftSide.highlight)}>
          {leftSide.content as React.ReactNode}
        </ComparePane>
        <div className="flex items-center justify-center sm:hidden">
          <IconArrowsExchange className="size-5 rotate-90 text-zinc-400" />
        </div>
        <ComparePane title={str(rightSide.title)} highlight={highlightOf(rightSide.highlight)}>
          {rightSide.content as React.ReactNode}
        </ComparePane>
      </div>
    </div>
  );
}

function CodePane({ code }: { code: string }) {
  return (
    <pre className="m-0 overflow-x-auto rounded bg-black/5 p-2 font-mono text-[11.5px] dark:bg-white/5">
      <code>{code}</code>
    </pre>
  );
}

export function CodeCompare({ incorrect, correct, before, after }: Record<string, any>) {
  return (
    <Compare
      left={{
        title: "Incorrect",
        highlight: "negative",
        content: <CodePane code={str(incorrect) || str(before)} />,
      }}
      right={{
        title: "Correct",
        highlight: "positive",
        content: <CodePane code={str(correct) || str(after)} />,
      }}
    />
  );
}

export function BeforeAfter({ before, after }: Record<string, any>) {
  return (
    <Compare
      left={{ title: "Before", highlight: "neutral", content: before }}
      right={{ title: "After", highlight: "positive", content: after }}
    />
  );
}

function PointsList({ points }: { points: unknown }) {
  return (
    <ul className="my-0 list-disc space-y-1 pl-4">
      {arr<unknown>(points).map((point, index) => (
        <li key={index} className="text-[13px]">
          {str(point)}
        </li>
      ))}
    </ul>
  );
}

export function Comparison({ sideA, sideB, summary }: Record<string, any>) {
  const a = (sideA ?? {}) as Record<string, unknown>;
  const b = (sideB ?? {}) as Record<string, unknown>;

  return (
    <div>
      <Compare
        left={{
          title: str(a.title),
          highlight: highlightOf(a.highlight),
          content: <PointsList points={a.points} />,
        }}
        right={{
          title: str(b.title),
          highlight: highlightOf(b.highlight),
          content: <PointsList points={b.points} />,
        }}
      />
      {summary && (
        <p className="mt-2 px-1 text-[13px] text-zinc-500 italic dark:text-zinc-400">
          {str(summary)}
        </p>
      )}
    </div>
  );
}

// ── Data table ───────────────────────────────────────────────────────────────

export function DataTable({ headers, rows, striped }: Record<string, any>) {
  const headerCells = arr<unknown>(headers);
  const bodyRows = arr<unknown[]>(rows);
  if (headerCells.length === 0 && bodyRows.length === 0) return null;

  return (
    <div className="my-6 overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b-2 border-zinc-200 dark:border-zinc-700">
            {headerCells.map((header, index) => (
              <th
                key={index}
                className="px-4 py-2 text-left font-semibold text-zinc-900 dark:text-zinc-100"
              >
                {str(header)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bodyRows.map((row, rowIndex) => (
            <tr
              key={rowIndex}
              className={cn(
                "border-b border-zinc-200 dark:border-zinc-800",
                bool(striped) && rowIndex % 2 === 1 && "bg-zinc-50 dark:bg-zinc-900/60"
              )}
            >
              {arr<unknown>(row).map((cell, cellIndex) => (
                <td key={cellIndex} className="px-4 py-2 text-zinc-700 dark:text-zinc-300">
                  {str(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Rich media ───────────────────────────────────────────────────────────────

/** YouTube / Vimeo watch URL → embeddable player URL. Mirrors the app's matcher. */
export function getEmbedUrl(url: string): string | null {
  if (!url) return null;
  const youtube = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/);
  if (youtube) return `https://www.youtube.com/embed/${youtube[1]}`;
  const vimeo = url.match(
    /vimeo\.com\/(?:channels\/[^/]+\/|groups\/[^/]+\/videos\/|video\/)?(\d+)/
  );
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
  return null;
}

/**
 * Escape hatch printed under every player.
 *
 * Widget hosts frame the widget itself, and both YouTube and Vimeo refuse to be
 * framed from an origin the uploader has not allowed — so the iframe can render
 * as an unexplained black rectangle with nothing the student can do about it.
 * The frame either works or it does not, and there is no reliable load event to
 * tell them apart from inside the sandbox, so the link is always offered.
 */
export function VideoFallbackLink({ url }: { url: string }) {
  if (!url) return null;

  return (
    <p className="mt-1.5 mb-0 text-[11px] text-zinc-400 dark:text-zinc-500">
      Video not playing?{" "}
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-zinc-500 underline underline-offset-2 dark:text-zinc-400"
      >
        Open it in a new tab
      </a>
    </p>
  );
}

export function Video({ url, title }: Record<string, any>) {
  const source = str(url);
  const embedUrl = getEmbedUrl(source);

  if (!embedUrl) {
    return (
      <div className="my-6 rounded-xl border border-zinc-200 bg-zinc-100 p-4 text-center text-[13px] text-zinc-500 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-400">
        Unable to load video.{" "}
        {source && (
          <a href={source} target="_blank" rel="noopener noreferrer" className="underline">
            Open link
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="my-6">
      {title && (
        <h4 className="mt-0 mb-2 text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">
          {str(title)}
        </h4>
      )}
      <div className="aspect-video overflow-hidden rounded-xl border border-zinc-200 bg-black dark:border-zinc-800">
        <iframe
          src={embedUrl}
          title={str(title) || "Video"}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="h-full w-full border-0"
        />
      </div>
      <VideoFallbackLink url={source} />
    </div>
  );
}

export function Audio({ src, title }: Record<string, any>) {
  return (
    <div className={CARD}>
      {title && (
        <div className="mb-3 flex items-center gap-2">
          <IconVolume className="size-5 shrink-0 text-[var(--brand-600)] dark:text-[var(--brand-400)]" />
          <h4 className="m-0 text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">
            {str(title)}
          </h4>
        </div>
      )}
      <audio controls src={str(src)} className="w-full">
        Your browser does not support the audio element.
      </audio>
    </div>
  );
}

export function Embed({ url, title, caption }: Record<string, any>) {
  return (
    <div className="my-6">
      {title && (
        <h4 className="mt-0 mb-2 text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">
          {str(title)}
        </h4>
      )}
      <div className="aspect-video overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-800">
        <iframe
          src={str(url)}
          title={str(title) || "Embedded content"}
          sandbox="allow-scripts allow-same-origin"
          className="h-full w-full border-0"
        />
      </div>
      {caption && (
        <p className="mt-2 text-center text-[13px] text-zinc-500 dark:text-zinc-400">
          {str(caption)}
        </p>
      )}
    </div>
  );
}

export function FileDownload({ url, filename, description }: Record<string, any>) {
  return (
    <div className={cn(CARD, "flex items-center gap-4")}>
      <IconFileDownload className="size-8 shrink-0 text-[var(--brand-600)] dark:text-[var(--brand-400)]" />
      <div className="min-w-0 flex-1">
        <p className="m-0 truncate text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">
          {str(filename)}
        </p>
        {description && (
          <p className="mt-0.5 mb-0 text-[13px] text-zinc-500 dark:text-zinc-400">
            {str(description)}
          </p>
        )}
      </div>
      <a
        href={str(url)}
        download={str(filename)}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 rounded-lg bg-[var(--brand-600)] px-4 py-2 text-[13px] font-semibold text-white no-underline dark:bg-[var(--brand-500)]"
      >
        Download
      </a>
    </div>
  );
}

// ── Interactive learning aids ────────────────────────────────────────────────

export function FlashcardSet({ cards }: Record<string, any>) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const deck = arr<{ front?: string; back?: string }>(cards);
  const card = deck[index];
  if (!card) return null;

  const goTo = (next: number) => {
    setFlipped(false);
    setIndex(next);
  };

  return (
    <div className="my-6">
      <button
        type="button"
        onClick={() => setFlipped((value) => !value)}
        aria-label={flipped ? "Showing back. Click to flip." : "Showing front. Click to flip."}
        className={cn(
          "mx-auto flex h-48 w-full max-w-md cursor-pointer items-center justify-center rounded-xl border border-zinc-200 p-6 text-center text-[13px] font-medium shadow-sm dark:border-zinc-800",
          flipped
            ? "bg-[var(--brand-50)] text-zinc-900 dark:bg-[var(--brand-950)]/40 dark:text-zinc-100"
            : "bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100"
        )}
      >
        {flipped ? str(card.back) : str(card.front)}
      </button>

      <div className="mt-4 flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={() => goTo(index - 1)}
          disabled={index === 0}
          aria-label="Previous card"
          className="cursor-pointer rounded-lg border border-zinc-200 bg-transparent p-2 text-zinc-500 disabled:opacity-30 dark:border-zinc-700 dark:text-zinc-400"
        >
          <IconChevronLeft className="size-4" />
        </button>
        <span className="text-[13px] text-zinc-500 dark:text-zinc-400">
          {index + 1} / {deck.length}
        </span>
        <button
          type="button"
          onClick={() => goTo(index + 1)}
          disabled={index === deck.length - 1}
          aria-label="Next card"
          className="cursor-pointer rounded-lg border border-zinc-200 bg-transparent p-2 text-zinc-500 disabled:opacity-30 dark:border-zinc-700 dark:text-zinc-400"
        >
          <IconChevronRight className="size-4" />
        </button>
      </div>

      <p className="mt-2 text-center text-[11px] text-zinc-400 dark:text-zinc-500">
        Click the card to flip it
      </p>
    </div>
  );
}

export function FillInTheBlank({ segments, explanation }: Record<string, any>) {
  const parts = arr<{ type?: string; value?: string }>(segments);
  const blanks = parts
    .map((segment, index) => (segment.type === "blank" ? index : -1))
    .filter((index) => index !== -1);

  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [checked, setChecked] = useState(false);

  if (parts.length === 0) return null;

  const isBlankCorrect = (index: number) =>
    (answers[index] ?? "").trim().toLowerCase() ===
    str(parts[index]?.value).trim().toLowerCase();
  const allCorrect = checked && blanks.every(isBlankCorrect);

  return (
    <div className={CARD}>
      <div className="flex flex-wrap items-baseline gap-1 text-[13px] leading-relaxed text-zinc-700 dark:text-zinc-300">
        {parts.map((segment, index) => {
          if (segment.type !== "blank") return <span key={index}>{str(segment.value)}</span>;
          const correct = checked && isBlankCorrect(index);
          return (
            <input
              key={index}
              type="text"
              value={answers[index] ?? ""}
              onChange={(event) =>
                setAnswers((previous) => ({ ...previous, [index]: event.target.value }))
              }
              disabled={checked}
              placeholder="..."
              aria-label={`Blank ${blanks.indexOf(index) + 1}`}
              className={cn(
                "inline-block w-28 border-0 border-b-2 bg-transparent px-1 py-0.5 text-center text-[13px] outline-none",
                !checked && "border-zinc-300 dark:border-zinc-600",
                checked && correct && "border-green-500 text-green-700 dark:text-green-400",
                checked && !correct && "border-red-500 text-red-700 dark:text-red-400"
              )}
            />
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {!checked ? (
          <button
            type="button"
            onClick={() => setChecked(true)}
            disabled={blanks.some((index) => !(answers[index] ?? "").trim())}
            className={PRIMARY_BUTTON}
          >
            Check
          </button>
        ) : (
          <Verdict
            correct={allCorrect}
            onRetry={() => {
              setAnswers({});
              setChecked(false);
            }}
          />
        )}
      </div>

      {checked && <Explanation text={str(explanation)} />}
    </div>
  );
}

const PAIR_COLORS = [
  "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",
  "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200",
  "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
  "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
];

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Shuffle that never returns the original order (so the exercise is never pre-solved). */
function shuffleDeranged<T>(items: T[]): T[] {
  if (items.length <= 1) return [...items];
  let result = shuffle(items);
  let attempts = 0;
  while (result.every((value, index) => value === items[index]) && attempts < 20) {
    result = shuffle(items);
    attempts += 1;
  }
  return result;
}

export function MatchingPairs({ pairs, explanation }: Record<string, any>) {
  const entries = arr<{ term?: string; match?: string }>(pairs);
  const shuffledIndices = useMemo(
    () => shuffleDeranged(entries.map((_, index) => index)),
    [entries.length]
  );

  const [connections, setConnections] = useState<Record<number, number>>({});
  const [selectedTerm, setSelectedTerm] = useState<number | null>(null);
  const [selectedMatch, setSelectedMatch] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);

  if (entries.length === 0) return null;

  const clearSelection = () => {
    setSelectedTerm(null);
    setSelectedMatch(null);
  };

  const onTerm = (termIndex: number) => {
    if (checked) return;
    if (connections[termIndex] !== undefined) {
      setConnections((previous) => {
        const next = { ...previous };
        delete next[termIndex];
        return next;
      });
      clearSelection();
      return;
    }
    if (selectedMatch !== null) {
      setConnections((previous) => ({ ...previous, [termIndex]: selectedMatch }));
      clearSelection();
      return;
    }
    setSelectedTerm(termIndex);
  };

  const onMatch = (matchIndex: number) => {
    if (checked) return;
    const connected = Object.entries(connections).find(([, value]) => value === matchIndex);
    if (connected) {
      setConnections((previous) => {
        const next = { ...previous };
        delete next[Number(connected[0])];
        return next;
      });
      clearSelection();
      return;
    }
    if (selectedTerm !== null) {
      setConnections((previous) => ({ ...previous, [selectedTerm]: matchIndex }));
      clearSelection();
      return;
    }
    setSelectedMatch(matchIndex);
  };

  const colorForTerm = (termIndex: number): string | null => {
    if (connections[termIndex] === undefined) return null;
    const position = Object.keys(connections).sort().indexOf(String(termIndex));
    return PAIR_COLORS[position % PAIR_COLORS.length];
  };

  const colorForMatch = (matchIndex: number): string | null => {
    const entry = Object.entries(connections).find(([, value]) => value === matchIndex);
    return entry ? colorForTerm(Number(entry[0])) : null;
  };

  const allCorrect = checked && entries.every((_, index) => connections[index] === index);
  const allConnected = Object.keys(connections).length === entries.length;

  return (
    <div className={CARD}>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">Terms</span>
          {entries.map((pair, termIndex) => (
            <button
              key={termIndex}
              type="button"
              onClick={() => onTerm(termIndex)}
              disabled={checked}
              className={cn(
                "w-full rounded-lg border border-zinc-200 p-3 text-left text-[13px] text-zinc-700 dark:border-zinc-700 dark:text-zinc-200",
                checked ? "cursor-default" : "cursor-pointer",
                colorForTerm(termIndex) ?? "bg-transparent",
                selectedTerm === termIndex && "ring-2 ring-[var(--brand-500)]",
                checked && connections[termIndex] === termIndex && "border-green-500",
                checked && connections[termIndex] !== termIndex && "border-red-500"
              )}
            >
              {str(pair.term)}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">Matches</span>
          {shuffledIndices.map((matchIndex) => (
            <button
              key={matchIndex}
              type="button"
              onClick={() => onMatch(matchIndex)}
              disabled={checked}
              className={cn(
                "w-full rounded-lg border border-zinc-200 p-3 text-left text-[13px] text-zinc-700 dark:border-zinc-700 dark:text-zinc-200",
                checked ? "cursor-default" : "cursor-pointer",
                colorForMatch(matchIndex) ?? "bg-transparent",
                selectedMatch === matchIndex && "ring-2 ring-[var(--brand-500)]"
              )}
            >
              {str(entries[matchIndex]?.match)}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {!checked ? (
          <button
            type="button"
            onClick={() => setChecked(true)}
            disabled={!allConnected}
            className={PRIMARY_BUTTON}
          >
            Check
          </button>
        ) : (
          <Verdict
            correct={allCorrect}
            onRetry={() => {
              setConnections({});
              clearSelection();
              setChecked(false);
            }}
          />
        )}
      </div>

      {checked && <Explanation text={str(explanation)} />}
    </div>
  );
}

export function Ordering({ items, explanation }: Record<string, any>) {
  const solution = arr<unknown>(items).map((item) => str(item));
  const initialOrder = useMemo(() => shuffleDeranged(solution), [solution.join(" ")]);

  const [order, setOrder] = useState<string[]>(initialOrder);
  const [selected, setSelected] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);

  if (solution.length === 0) return null;

  const onItem = (index: number) => {
    if (checked) return;
    if (selected === null) {
      setSelected(index);
      return;
    }
    if (selected === index) {
      setSelected(null);
      return;
    }
    setOrder((previous) => {
      const next = [...previous];
      [next[selected], next[index]] = [next[index], next[selected]];
      return next;
    });
    setSelected(null);
  };

  const allCorrect = checked && solution.every((item, index) => order[index] === item);

  return (
    <div className={CARD}>
      <div className="space-y-2">
        {order.map((item, index) => {
          const correct = checked && order[index] === solution[index];
          return (
            <button
              key={`${index}-${item}`}
              type="button"
              onClick={() => onItem(index)}
              disabled={checked}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg border border-zinc-200 bg-transparent p-3 text-left text-[13px] text-zinc-700 dark:border-zinc-700 dark:text-zinc-200",
                checked ? "cursor-default" : "cursor-pointer",
                selected === index && "bg-[var(--brand-50)] ring-2 ring-[var(--brand-500)] dark:bg-[var(--brand-950)]/40",
                checked && correct && "border-green-500 bg-green-50 dark:bg-green-950",
                checked && !correct && "border-red-500 bg-red-50 dark:bg-red-950"
              )}
            >
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                  !checked && "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
                  checked && correct && "bg-green-500 text-white",
                  checked && !correct && "bg-red-500 text-white"
                )}
              >
                {checked ? (
                  correct ? (
                    <IconCheck className="size-3" />
                  ) : (
                    <IconX className="size-3" />
                  )
                ) : (
                  index + 1
                )}
              </span>
              <span className="flex-1">{item}</span>
            </button>
          );
        })}
      </div>

      <p className="mt-2 mb-0 text-[11px] text-zinc-400 dark:text-zinc-500">
        Tap one item then another to swap them
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {!checked ? (
          <button type="button" onClick={() => setChecked(true)} className={PRIMARY_BUTTON}>
            Check
          </button>
        ) : (
          <Verdict
            correct={allCorrect}
            onRetry={() => {
              setOrder(initialOrder);
              setSelected(null);
              setChecked(false);
            }}
          />
        )}
      </div>

      {checked && <Explanation text={str(explanation)} />}
    </div>
  );
}

// ── Checkpoints ──────────────────────────────────────────────────────────────

/**
 * Inline checkpoint placeholder. Checkpoint attempts are server-write-only and
 * gated on entitlements (#532/#543), and the exercise renderer needs the
 * lesson's checkpoint provider — neither exists in a widget. So the widget
 * marks the position and sends the student to the course to answer it.
 */
export function LessonCheckpoint({ checkpointId, label }: Record<string, any>) {
  const id = num(checkpointId);
  if (id === undefined) return null;

  return (
    <div className="my-6 flex items-center gap-3 rounded-xl border border-[var(--brand-200)] bg-[var(--brand-50)] px-4 py-3 dark:border-[var(--brand-900)] dark:bg-[var(--brand-950)]/40">
      <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--brand-100)] text-[var(--brand-700)] dark:bg-[var(--brand-900)] dark:text-[var(--brand-300)]">
        <IconFlag className="size-4" />
      </div>
      <div className="min-w-0">
        <p className="m-0 text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">
          {str(label) || "Checkpoint"}
        </p>
        <p className="mt-0.5 mb-0 text-[11px] text-zinc-500 dark:text-zinc-400">
          Answer this checkpoint in the course to record your attempt.
        </p>
      </div>
    </div>
  );
}
