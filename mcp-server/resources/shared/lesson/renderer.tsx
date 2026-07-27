import { Component, Fragment, type ReactNode } from "react";
import {
  Answer,
  Audio,
  BeforeAfter,
  Callout,
  CodeBlock,
  CodeCompare,
  Compare,
  Comparison,
  Danger,
  DataTable,
  Definition,
  Embed,
  FileDownload,
  FillInTheBlank,
  FlashcardSet,
  Glossary,
  Hint,
  Info,
  InlineCode,
  LessonCheckpoint,
  MatchingPairs,
  Ordering,
  Quiz,
  Solution,
  Spoiler,
  Step,
  Steps,
  Success,
  Tip,
  Vocabulary,
  Video,
  Warning,
} from "./components";
import { attributesToProps, nodeText, parseLessonBlocks, type MdNode } from "./mdx";

/**
 * Renders a parsed lesson MDX tree with the same component set the web app
 * hands to `<MDXClient>` (see `components/lesson/mdx-components.tsx`).
 */

/** MDX tag → component. Mirrors `lessonMdxComponents` in the web app. */
const LESSON_COMPONENTS: Record<string, (props: Record<string, any>) => ReactNode> = {
  Callout,
  Info,
  Warning,
  Tip,
  Success,
  Danger,
  Spoiler,
  Solution,
  Hint,
  Answer,
  Quiz,
  CodeBlock,
  Vocabulary,
  Steps,
  Step,
  Definition,
  Glossary,
  Compare,
  CodeCompare,
  BeforeAfter,
  Audio,
  Video,
  Embed,
  FileDownload,
  Comparison,
  Table: DataTable,
  FlashcardSet,
  FillInTheBlank,
  MatchingPairs,
  Ordering,
  LessonCheckpoint,
};

const BLOCK = "mb-3 text-[14px] leading-[1.7] text-zinc-700 dark:text-zinc-300";

const HEADINGS: Record<number, string> = {
  1: "mt-5 mb-2 text-[20px] font-bold tracking-tight text-zinc-900 dark:text-zinc-100",
  2: "mt-5 mb-2 text-[18px] font-bold tracking-tight text-zinc-900 dark:text-zinc-100",
  3: "mt-4 mb-2 text-[16px] font-bold tracking-tight text-zinc-900 dark:text-zinc-100",
  4: "mt-4 mb-2 text-[15px] font-bold tracking-tight text-zinc-900 dark:text-zinc-100",
  5: "mt-3 mb-2 text-[14px] font-bold tracking-tight text-zinc-900 dark:text-zinc-100",
  6: "mt-3 mb-2 text-[13px] font-bold tracking-tight text-zinc-900 dark:text-zinc-100",
};

/**
 * Walk state. `steps` numbers <Step> elements by the order the walk reaches
 * them: authored steps land at varying depths (indented ones parse as inline
 * JSX inside a paragraph), and a counter bumped inside a React component would
 * double-count under React's development double-invoke. The walk runs once per
 * render call, so its numbering is stable.
 */
type WalkContext = { steps?: { count: number } };

function renderChildren(node: MdNode, ctx: WalkContext): ReactNode[] {
  return (node.children ?? []).map((child, index) => (
    <Fragment key={index}>{renderNode(child, ctx)}</Fragment>
  ));
}

/** `title="setup.ts"` in a fenced code block's meta, as the block editor writes it. */
function filenameFromMeta(meta: unknown): string | undefined {
  if (typeof meta !== "string") return undefined;
  return meta.match(/title="([^"]*)"/)?.[1];
}

function renderNode(node: MdNode, ctx: WalkContext): ReactNode {
  switch (node.type) {
    case "root":
      return <>{renderChildren(node, ctx)}</>;

    case "paragraph":
      return <p className={BLOCK}>{renderChildren(node, ctx)}</p>;

    case "heading": {
      const depth = Math.min(Math.max(Number(node.depth) || 1, 1), 6);
      // The lesson title owns <h1> in the widget chrome, so authored headings
      // shift down one level — same demotion the plain-markdown renderer does.
      const Tag = `h${Math.min(depth + 1, 6)}` as "h2";
      return <Tag className={HEADINGS[depth]}>{renderChildren(node, ctx)}</Tag>;
    }

    case "text":
      return node.value ?? "";

    case "strong":
      return (
        <strong className="font-bold text-zinc-900 dark:text-zinc-100">
          {renderChildren(node, ctx)}
        </strong>
      );

    case "emphasis":
      return <em>{renderChildren(node, ctx)}</em>;

    case "delete":
      return <del>{renderChildren(node, ctx)}</del>;

    case "break":
      return <br />;

    case "inlineCode":
      return <InlineCode>{node.value}</InlineCode>;

    case "code":
      return (
        <CodeBlock language={node.lang} filename={filenameFromMeta(node.meta)}>
          {node.value ?? ""}
        </CodeBlock>
      );

    case "blockquote":
      return (
        <blockquote className="mb-3 border-l-2 border-zinc-300 py-1 pl-4 text-zinc-600 italic dark:border-zinc-600 dark:text-zinc-400 [&>p:last-child]:mb-0">
          {renderChildren(node, ctx)}
        </blockquote>
      );

    case "list": {
      const Tag = node.ordered ? "ol" : "ul";
      return (
        <Tag
          className={`${BLOCK} ${node.ordered ? "list-decimal" : "list-disc"} pl-6`}
          start={typeof node.start === "number" && node.start !== 1 ? node.start : undefined}
        >
          {renderChildren(node, ctx)}
        </Tag>
      );
    }

    case "listItem":
      return (
        <li className={typeof node.checked === "boolean" ? "mb-1 list-none" : "mb-1"}>
          {typeof node.checked === "boolean" && (
            <input type="checkbox" checked={node.checked} readOnly className="mr-2 align-middle" />
          )}
          {renderChildren(node, ctx)}
        </li>
      );

    case "link":
      return (
        <a
          href={String(node.url ?? "")}
          target="_blank"
          rel="noopener noreferrer"
          title={typeof node.title === "string" ? node.title : undefined}
          className="font-medium text-[var(--brand-700)] underline decoration-[var(--brand-400)] underline-offset-2 dark:text-[var(--brand-400)]"
        >
          {renderChildren(node, ctx)}
        </a>
      );

    case "image":
      return (
        <img
          src={String(node.url ?? "")}
          alt={String(node.alt ?? "")}
          title={typeof node.title === "string" ? node.title : undefined}
          loading="lazy"
          className="my-3 max-w-full rounded-xl border border-zinc-200 dark:border-zinc-800"
        />
      );

    case "thematicBreak":
      return <hr className="my-5 border-0 border-t border-zinc-200 dark:border-zinc-800" />;

    case "table": {
      const [head, ...body] = node.children ?? [];
      const align = Array.isArray(node.align) ? (node.align as (string | null)[]) : [];
      return (
        <div className="mb-3 overflow-x-auto">
          <table className="min-w-[320px] border-collapse text-[13px]">
            {head && (
              <thead>
                <tr>
                  {(head.children ?? []).map((cell, index) => (
                    <th
                      key={index}
                      style={{ textAlign: (align[index] as any) ?? "left" }}
                      className="border border-zinc-200 bg-zinc-50 px-3 py-1.5 font-semibold text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                    >
                      {renderChildren(cell, ctx)}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {body.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {(row.children ?? []).map((cell, cellIndex) => (
                    <td
                      key={cellIndex}
                      style={{ textAlign: (align[cellIndex] as any) ?? "left" }}
                      className="border border-zinc-200 px-3 py-1.5 text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
                    >
                      {renderChildren(cell, ctx)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    case "mdxJsxFlowElement":
    case "mdxJsxTextElement": {
      // A nameless element is an MDX fragment (<>…</>).
      if (!node.name) return <>{renderChildren(node, ctx)}</>;

      // <Steps> opens a numbering scope; each <Step> the walk reaches inside it
      // takes the next number, wherever it sits in the tree.
      const scoped: WalkContext =
        node.name === "Steps" ? { ...ctx, steps: { count: 0 } } : ctx;

      const Component = LESSON_COMPONENTS[node.name];
      const props = attributesToProps(node);
      if (node.name === "Step" && scoped.steps && props.number === undefined) {
        scoped.steps.count += 1;
        props.number = scoped.steps.count;
      }
      const children =
        (node.children ?? []).length > 0 ? renderChildren(node, scoped) : undefined;

      if (Component) {
        // CodeBlock reads its body as a string, not as rendered nodes.
        const body =
          node.name === "CodeBlock" ? nodeText(node) : children;
        return <Component {...props}>{body}</Component>;
      }

      // Unknown tag: keep the authored text visible instead of dropping it.
      return children ? <>{children}</> : null;
    }

    // Import/export statements and `{expressions}` carry no rendered output
    // here — evaluating them would need a JS runtime the widget can not use.
    case "mdxjsEsm":
    case "mdxFlowExpression":
    case "mdxTextExpression":
    case "html":
    case "yaml":
      return null;

    default:
      return node.children ? <>{renderChildren(node, ctx)}</> : null;
  }
}

// ── Public surface ───────────────────────────────────────────────────────────

class RenderBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** Raw source behind a banner — the last resort for a block we can not parse. */
function SourceFallback({ source, notice }: { source: string; notice: string }) {
  return (
    <div>
      <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-800 dark:bg-amber-950 dark:text-amber-300">
        {notice}
      </p>
      <pre className="m-0 overflow-x-auto text-[12.5px] whitespace-pre-wrap text-zinc-600 dark:text-zinc-400">
        {source}
      </pre>
    </div>
  );
}

export function LessonMdxContent({ content }: { content: string }) {
  const blocks = parseLessonBlocks(content);

  // Nothing at all parsed — the document is broken end to end, so say so once
  // rather than repeating the banner over every block.
  if (!blocks.some((block) => block.tree)) {
    return (
      <SourceFallback
        source={content}
        notice="This lesson could not be rendered fully — showing its source text."
      />
    );
  }

  return (
    <div className="max-w-[72ch] break-words">
      {blocks.map((block, index) => {
        const fallback = (
          <SourceFallback
            source={block.source}
            notice="This part of the lesson could not be rendered — showing its source text."
          />
        );

        if (!block.tree) return <Fragment key={index}>{fallback}</Fragment>;

        return (
          <RenderBoundary key={index} fallback={fallback}>
            {renderNode(block.tree, {})}
          </RenderBoundary>
        );
      })}
    </div>
  );
}
