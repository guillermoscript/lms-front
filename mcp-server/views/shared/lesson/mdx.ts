import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMdx from "remark-mdx";

/**
 * Lesson MDX parsing for widgets.
 *
 * `lessons.content` is an MDX source string (markdown + JSX components) — the
 * same string the web app compiles with `next-mdx-remote-client`. Widgets can
 * not compile-and-run MDX: `@mdx-js/mdx`'s `run()` builds the module with the
 * Function constructor, which a widget's CSP sandbox blocks. So we *parse*
 * only — remark's mdast keeps the JSX elements as `mdxJsxFlowElement` /
 * `mdxJsxTextElement` nodes — and render that tree with React ourselves.
 *
 * Parsing is pure syntax analysis, no evaluation, so it works anywhere.
 */

export type MdNode = {
  type: string;
  value?: string;
  name?: string | null;
  children?: MdNode[];
  attributes?: MdAttribute[];
  [key: string]: unknown;
};

type MdAttribute = {
  type: string;
  name?: string;
  value?: string | { type: string; value?: string } | null;
};

const processor = unified().use(remarkParse).use(remarkGfm).use(remarkMdx);

/** Parse lesson MDX into an mdast tree. Returns null when the source fails to parse. */
export function parseLessonMdx(source: string): MdNode | null {
  try {
    return processor.parse(source) as unknown as MdNode;
  } catch {
    return null;
  }
}

// ── Source normalization ─────────────────────────────────────────────────────

/**
 * Move `<CodeBlock>` bodies out of the children position and into a `code` prop.
 *
 * MDX parses a JSX element's children as MDX, so a snippet whose first line
 * starts at column 0 with `export` or `import` is read as an ESM statement and
 * handed to acorn — which then chokes on `</CodeBlock>` and fails the *whole
 * document*. Pasting a module into `<CodeBlock>` is the documented usage
 * (`components/lesson/mdx-components.tsx`), so this is the common case, not an
 * exotic one.
 *
 * `{expressions}` and `<tags>` inside a snippet break the same way. Rewriting
 * the body to `code={JSON.parse('…')}` — the escape hatch the block editor's
 * serializer already uses for complex props — makes the snippet opaque to the
 * parser, so none of them can reach acorn. It also renders more faithfully:
 * as children, `**bold**` inside a snippet parsed as markdown and the asterisks
 * were lost on the way to the `<pre>`.
 *
 * `mcp-server/resources/shared/lesson/mdx.ts` and `lib/lesson/mdx-source.ts`
 * hold the same implementation for the two renderers (widget / web app);
 * `tests/unit/mcp-lesson-mdx.test.ts` asserts they stay identical.
 */
export function inlineCodeBlockBodies(source: string): string {
  return source.replace(
    /<CodeBlock(\s[^>]*?)?>([\s\S]*?)<\/CodeBlock>/g,
    (whole, rawAttributes: string | undefined, body: string) => {
      const attributes = rawAttributes ?? "";
      // Already prop-carried, or an empty block — nothing to move.
      if (/(^|\s)code\s*=/.test(attributes) || body.trim() === "") return whole;

      // Drop the newline that follows the opening tag and the indentation that
      // precedes the closing one; both are layout, not part of the snippet.
      const code = body.replace(/^\r?\n/, "").replace(/\r?\n[ \t]*$/, "");

      // JSON.stringify escapes everything acorn cares about except the single
      // quote wrapping the payload, which resolveExpression un-escapes again.
      const payload = JSON.stringify(code).split("'").join("\\'");
      return `<CodeBlock${attributes} code={JSON.parse('${payload}')} />`;
    }
  );
}

// ── Block-level parsing ──────────────────────────────────────────────────────

/** One top-level slice of a lesson. `tree` is null when that slice failed to parse. */
export type LessonBlock = { source: string; tree: MdNode | null };

/**
 * Split MDX source at blank lines that sit outside a fenced code block.
 *
 * A fence may contain blank lines of its own, and an unterminated fence parses
 * happily to end-of-input, so splitting inside one silently mangles the rest of
 * the document rather than erroring.
 */
function splitOnBlankLines(source: string): string[] {
  const segments: string[] = [];
  let current: string[] = [];
  let fence: string | null = null;

  const flush = () => {
    if (current.join("\n").trim() !== "") segments.push(current.join("\n"));
    current = [];
  };

  for (const line of source.split("\n")) {
    const fenceMarker = line.match(/^\s*(```+|~~~+)/)?.[1];
    if (fenceMarker) {
      if (fence === null) fence = fenceMarker[0];
      else if (fenceMarker[0] === fence) fence = null;
    }

    if (fence === null && line.trim() === "") {
      flush();
      continue;
    }
    current.push(line);
  }
  flush();

  return segments;
}

/**
 * Parse a lesson into independently-rendered blocks.
 *
 * The whole document is tried first, and on success it stays one block — the
 * ordinary path is unchanged, including `<Steps>` numbering, which is scoped
 * per parse. Only when the document as a whole fails to parse does this fall
 * back to per-block parsing, so one unparseable snippet costs the student that
 * snippet rather than the entire lesson.
 *
 * Blocks are re-joined greedily: a multi-line element like `<Steps>` fails on
 * its own (`Expected a closing tag`), so its segments are pulled in until the
 * element closes and the whole thing parses.
 */
export function parseLessonBlocks(source: string): LessonBlock[] {
  const normalized = inlineCodeBlockBodies(source);

  const whole = parseLessonMdx(normalized);
  if (whole) return [{ source: normalized, tree: whole }];

  const segments = splitOnBlankLines(normalized);
  const blocks: LessonBlock[] = [];

  // An unclosed tag early in a long document makes every re-join attempt fail,
  // which is quadratic. Lessons are nowhere near that size, but the walk runs in
  // the browser, so it gets a budget rather than the benefit of the doubt.
  let attempts = 0;
  const budget = 2000;

  for (let start = 0; start < segments.length; ) {
    let joined = segments[start];
    let tree = parseLessonMdx(joined);
    let end = start;
    attempts += 1;

    while (!tree && end + 1 < segments.length && attempts < budget) {
      end += 1;
      joined = `${joined}\n\n${segments[end]}`;
      tree = parseLessonMdx(joined);
      attempts += 1;
    }

    if (tree) {
      blocks.push({ source: joined, tree });
      start = end + 1;
    } else {
      // Nothing from here on parses together — degrade this segment alone and
      // let the next one try on its own.
      blocks.push({ source: segments[start], tree: null });
      start += 1;
    }
  }

  return blocks;
}

/**
 * Resolve one JSX attribute expression to a value without evaluating it.
 *
 * The block editor's serializer emits complex props as `{JSON.parse('<json>')}`
 * (it does that to dodge Acorn parse errors on raw object literals), and simple
 * ones as `{0}` / `{true}`. Hand-written MDX may also use plain JSON literals.
 * Anything we can not resolve is handed back as the raw expression text, which
 * degrades to a visible string rather than a crash.
 */
export function resolveExpression(raw: string): unknown {
  const expression = raw.trim();
  if (expression === "") return undefined;

  const jsonParseCall = expression.match(
    /^JSON\s*\.\s*parse\s*\(\s*(['"])([\s\S]*)\1\s*\)$/
  );
  if (jsonParseCall) {
    const quote = jsonParseCall[1];
    // The serializer escapes only the wrapping quote character; every other
    // backslash belongs to the JSON payload and must survive to JSON.parse.
    const unescaped = jsonParseCall[2].split("\\" + quote).join(quote);
    try {
      return JSON.parse(unescaped);
    } catch {
      return raw;
    }
  }

  try {
    return JSON.parse(expression);
  } catch {
    return raw;
  }
}

/** Collect a JSX element's attributes into a props object. Spreads are ignored. */
export function attributesToProps(node: MdNode): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  for (const attribute of node.attributes ?? []) {
    if (attribute.type !== "mdxJsxAttribute" || !attribute.name) continue;

    const value = attribute.value;
    if (value === null || value === undefined) {
      // Bare attribute — `<Table striped />` means striped={true}.
      props[attribute.name] = true;
    } else if (typeof value === "string") {
      props[attribute.name] = value;
    } else if (value.type === "mdxJsxAttributeValueExpression") {
      props[attribute.name] = resolveExpression(value.value ?? "");
    }
  }
  return props;
}

/** Flatten an mdast subtree to its plain text — used for code and label props. */
export function nodeText(node: MdNode | undefined): string {
  if (!node) return "";
  if (typeof node.value === "string") return node.value;
  return (node.children ?? []).map(nodeText).join("");
}
