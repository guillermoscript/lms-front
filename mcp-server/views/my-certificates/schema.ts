import { z } from "zod";

// ── Schema ──────────────────────────────────────────────────────────────────

const certificateSchema = z.object({
  certificate_id: z.string(),
  course_id: z.number().nullable(),
  course_title: z.string().nullable(),
  verification_code: z.string(),
  /** Absolute link to the public verify page, or null when the host is unknown. */
  verify_url: z.string().nullable(),
  pdf_url: z.string().nullable(),
  issued_at: z.string().nullable(),
  expires_at: z.string().nullable(),
  revoked_at: z.string().nullable(),
  revoke_reason: z.string().nullable(),
  status: z.enum(["valid", "expired", "revoked"]),
  share_count: z.number(),
  view_count: z.number(),
});

export const propsSchema = z.object({
  total: z.number(),
  // Pagination window this payload represents. Optional so a payload from an
  // older server still validates — it simply renders as a single full page.
  offset: z.number().optional(),
  limit: z.number().optional(),
  has_more: z.boolean().optional(),
  /** Repeated on every page so "load more" keeps the same filter. */
  include_revoked: z.boolean().optional(),
  /** Page-level — recomputed below from the rows actually loaded. */
  valid: z.number(),
  certificates: z.array(certificateSchema),
});

export type Props = z.infer<typeof propsSchema>;
export type Certificate = z.infer<typeof certificateSchema>;
