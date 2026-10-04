import { z } from "zod";

const certificateSchema = z.object({
  certificate_id: z.string(),
  student_id: z.string().nullable(),
  student_name: z.string().nullable(),
  verification_code: z.string(),
  verify_url: z.string().nullable(),
  issued_at: z.string().nullable(),
  expires_at: z.string().nullable(),
  revoked_at: z.string().nullable(),
  revoke_reason: z.string().nullable(),
  status: z.enum(["valid", "expired", "revoked"]),
});

export const propsSchema = z.object({
  course: z.object({ id: z.number(), title: z.string() }),
  /** null when the course has no template at all — nothing can ever be issued. */
  template: z
    .object({
      name: z.string(),
      issuer_name: z.string().nullable(),
      is_active: z.boolean(),
      min_lesson_completion_pct: z.number().nullable(),
      min_exam_pass_score: z.number().nullable(),
      requires_all_exams: z.boolean(),
      expiration_days: z.number().nullable(),
    })
    .nullable(),
  summary: z.object({
    issued: z.number(),
    revoked: z.number(),
    active_students: z.number(),
    awaiting: z.number(),
  }),
  certificates: z.array(certificateSchema),
  awaiting: z.array(
    z.object({ student_id: z.string(), student_name: z.string().nullable() })
  ),
});

export type Props = z.infer<typeof propsSchema>;
export type Certificate = z.infer<typeof certificateSchema>;
