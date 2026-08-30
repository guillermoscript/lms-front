import { z } from "zod";

// ── Schema ──────────────────────────────────────────────────────────────────

const sectionSchema = z.object({
  type: z.string(),
  layout: z.string(), // hero | band | stats | grid | list | media | nav | text
  heading: z.string(),
  subtitle: z.string(),
  ctas: z.array(z.string()),
  items: z.array(z.string()),
  itemCount: z.number(),
  color: z.string().nullable(), // explicit block backgroundColor/accentColor override
});

export const propsSchema = z.object({
  title: z.string(),
  slug: z.string(),
  is_published: z.boolean(),
  public_path: z.string(),
  preview_path: z.string(),
  preview_url: z.string().nullable(),
  brand_color: z.string().nullable(), // tenants.primary_color — what var(--primary) resolves to
  sections: z.array(sectionSchema),
  warnings: z.array(z.string()),
});

export type Props = z.infer<typeof propsSchema>;
export type Section = z.infer<typeof sectionSchema>;
