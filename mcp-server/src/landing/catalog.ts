/**
 * Landing-page block vocabulary for the MCP tools.
 *
 * Derived entirely from the generated mirrors (puck-fields.generated.ts +
 * catalog-meta.generated.ts), which `scripts/gen-puck-fields-manifest.ts` in the repo
 * root emits from `lib/puck/config.ts` — the same single source of truth that feeds the
 * human Puck editor and the app's AI generator. Never hand-edit the generated files;
 * re-run the script after changing any Puck block.
 */
import type { z } from "zod";
import { puckFieldsToZod, type PuckField } from "./from-puck-fields.js";
import { PUCK_FIELDS_MANIFEST } from "./puck-fields.generated.js";
import {
  COMPONENT_DESCRIPTIONS,
  EXCLUDED_COMPONENTS,
  LANDING_PAGE_CRAFT_GUIDE,
} from "./catalog-meta.generated.js";
import type { JsonRenderSpec } from "./to-puck.js";

const EXCLUDED = new Set(EXCLUDED_COMPONENTS);

/** Zod props schema per generatable block type. */
const PROPS_SCHEMA_BY_TYPE: Record<string, z.ZodObject<Record<string, z.ZodTypeAny>>> = {};
for (const [name, entry] of Object.entries(PUCK_FIELDS_MANIFEST)) {
  if (EXCLUDED.has(name)) continue;
  PROPS_SCHEMA_BY_TYPE[name] = puckFieldsToZod(entry.fields as Record<string, PuckField>);
}

/** Names an agent may use as page sections. */
export const CATALOG_COMPONENT_NAMES = Object.keys(PROPS_SCHEMA_BY_TYPE);

/**
 * Each component's Puck `defaultProps`. The bridge merges these UNDER the agent-supplied
 * props so a generated block always has its required arrays/values even when omitted —
 * Puck's `Render` does not reliably backfill defaults for top-level props.
 */
export const DEFAULT_PROPS_BY_TYPE: Record<string, Record<string, unknown>> = {};
for (const [name, entry] of Object.entries(PUCK_FIELDS_MANIFEST)) {
  DEFAULT_PROPS_BY_TYPE[name] = (entry.defaultProps ?? {}) as Record<string, unknown>;
}

export { LANDING_PAGE_CRAFT_GUIDE };

// ── Validation ───────────────────────────────────────────────────────────────

export interface SpecValidation {
  /** Fatal problems — the page must not be saved. */
  errors: string[];
  /** Non-fatal notes (e.g. unknown props that will be ignored by the renderer). */
  warnings: string[];
}

/**
 * Validate a normalized spec against the block vocabulary: every element's type must be
 * a generatable block and its props must match that block's schema. Equivalent in effect
 * to the app's `landingCatalog.validate(spec)` for the flat-section pages these tools
 * produce.
 */
export function validateSpec(spec: JsonRenderSpec): SpecValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const [id, el] of Object.entries(spec.elements)) {
    const schema = PROPS_SCHEMA_BY_TYPE[el.type];
    if (!schema) {
      if (EXCLUDED.has(el.type)) {
        errors.push(
          `Element '${id}': type '${el.type}' is a structural block reserved for the human editor — compose the page from section blocks instead (see lms_get_landing_blocks).`
        );
      } else {
        errors.push(
          `Element '${id}': unknown block type '${el.type}'. Valid types: ${CATALOG_COMPONENT_NAMES.join(", ")}.`
        );
      }
      continue;
    }

    const props = el.props ?? {};
    const parsed = schema.safeParse(props);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        errors.push(
          `Element '${id}' (${el.type}): prop '${issue.path.join(".")}' — ${issue.message}`
        );
      }
    }

    // Unknown props are stripped by the renderer, not fatal — but tell the agent so
    // typos ('subtitle' vs 'subheading') don't silently vanish.
    const known = new Set(Object.keys(schema.shape));
    for (const key of Object.keys(props)) {
      if (!known.has(key)) {
        warnings.push(
          `Element '${id}' (${el.type}): prop '${key}' is not part of this block and will be ignored.`
        );
      }
    }
  }

  return { errors, warnings };
}

// ── Vocabulary documentation (for lms_get_landing_blocks) ────────────────────

function fieldSignature(field: PuckField): string {
  switch (field.type) {
    case "text":
    case "textarea":
      return "string";
    case "number":
      return "number";
    case "radio":
    case "select": {
      const values = (field.options ?? []).map((o) => JSON.stringify(String(o.value)));
      return values.length > 0 ? values.join(" | ") : "string";
    }
    case "array": {
      const inner = Object.entries(field.arrayFields ?? {})
        .map(([k, sub]) => `${k}: ${fieldSignature(sub)}`)
        .join("; ");
      return `Array<{ ${inner} }>`;
    }
    default:
      return "unknown";
  }
}

/** Render the full block vocabulary as markdown for the discovery tool. */
export function renderBlocksDoc(): string {
  const byCategory = new Map<string, string[]>();
  for (const name of CATALOG_COMPONENT_NAMES) {
    const cat = PUCK_FIELDS_MANIFEST[name]?.category ?? "other";
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(name);
  }

  const sections: string[] = [];
  for (const [cat, names] of byCategory) {
    const blocks = names.map((name) => {
      const entry = PUCK_FIELDS_MANIFEST[name];
      const description = COMPONENT_DESCRIPTIONS[name] ?? `The ${name} landing-page block.`;
      const props = Object.entries(entry.fields as Record<string, PuckField>)
        .map(([k, f]) => `  - ${k}: ${fieldSignature(f)}${f.label ? ` — ${f.label}` : ""}`)
        .join("\n");
      return `### ${name}\n${description}\n${props ? `Props (all optional — omitted props use sensible defaults):\n${props}` : "No props."}`;
    });
    sections.push(`## Category: ${cat}\n\n${blocks.join("\n\n")}`);
  }
  return sections.join("\n\n");
}
