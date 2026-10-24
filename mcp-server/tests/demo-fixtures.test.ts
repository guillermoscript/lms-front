import { describe, it, expect } from "vitest";
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { WIDGET_DEMOS } from "../src/demo-data.js";

// demo-data.ts's invariant: every variant satisfies its widget's propsSchema.
// The paging/optional fields mean a stale fixture can still validate, but a
// renamed or retyped field fails here instead of rendering blank in QA.
const VIEWS_DIR = join(import.meta.dirname, "..", "views");

describe("widget demo fixtures", () => {
  for (const demo of WIDGET_DEMOS) {
    for (const variant of demo.variants) {
      it(`${demo.widget} / ${variant.id} matches its propsSchema`, async () => {
        const mod = (await import(`../views/${demo.widget}/schema.ts`)) as {
          propsSchema: { safeParse: (v: unknown) => { success: boolean; error?: unknown } };
        };
        const result = mod.propsSchema.safeParse(variant.props);
        expect(result.success, JSON.stringify(result.error)).toBe(true);
      });
    }
  }

  it("every view with a schema has a demo", () => {
    const views = readdirSync(VIEWS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory() && existsSync(join(VIEWS_DIR, d.name, "view.tsx")))
      .filter((d) => existsSync(join(VIEWS_DIR, d.name, "schema.ts")))
      .map((d) => d.name);
    const demoed = new Set(WIDGET_DEMOS.map((d) => d.widget));
    expect(views.filter((v) => !demoed.has(v))).toEqual([]);
  });
});
