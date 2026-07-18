/**
 * Auto-derive a Zod schema from a Puck component's `fields` definition — MCP-server copy.
 *
 * Mirrors lib/json-render/from-puck-fields.ts in the main repo (the MCP server is built
 * and deployed standalone, so it cannot import it). Keep the two in sync — this is the
 * validation contract that makes an agent-authored page open cleanly in the Puck editor.
 *
 * All fields are made `.nullable().optional()` because agents routinely omit props and
 * missing props fall back to the component's `defaultProps` via the bridge's backfill.
 */
import { z } from "zod";

// Minimal structural type for a Puck field (we only read what we convert).
interface PuckOption {
  label: string;
  value: string | number | boolean;
}
export interface PuckField {
  type: "text" | "textarea" | "number" | "radio" | "select" | "array";
  label?: string;
  options?: PuckOption[];
  arrayFields?: Record<string, PuckField>;
}

function describe(zt: z.ZodTypeAny, label?: string): z.ZodTypeAny {
  return label ? zt.describe(label) : zt;
}

/** Convert a single Puck field to a Zod type. */
function fieldToZod(field: PuckField): z.ZodTypeAny {
  switch (field.type) {
    case "text":
    case "textarea":
      return describe(z.string(), field.label);

    case "number":
      return describe(z.number(), field.label);

    case "radio":
    case "select": {
      const values = (field.options ?? []).map((o) => String(o.value));
      // enum needs at least one value; fall back to string if options are dynamic/empty.
      if (values.length === 0) return describe(z.string(), field.label);
      return describe(z.enum(values as [string, ...string[]]), field.label);
    }

    case "array": {
      const shape: Record<string, z.ZodTypeAny> = {};
      for (const [k, sub] of Object.entries(field.arrayFields ?? {})) {
        // Items within an array are optional/nullable for the same partial-spec reasons.
        shape[k] = fieldToZod(sub).nullable().optional();
      }
      const item = z.object(shape);
      return describe(z.array(item), field.label);
    }

    default:
      return describe(z.unknown(), field.label);
  }
}

/**
 * Convert a Puck component's full `fields` map into a Zod object schema.
 * Every prop is nullable + optional so partial agent output validates and renders.
 */
export function puckFieldsToZod(
  fields: Record<string, PuckField> | undefined
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [name, field] of Object.entries(fields ?? {})) {
    shape[name] = fieldToZod(field).nullable().optional();
  }
  return z.object(shape);
}
