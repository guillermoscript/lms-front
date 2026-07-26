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
