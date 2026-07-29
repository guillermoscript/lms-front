import { z } from "zod";
import type { MCPServer } from "mcp-use/server";
import { widget, text } from "mcp-use/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LmsSession } from "../session.js";
import { ok, okText, errorResult } from "../format.js";
import { getPlatformDomain } from "../env.js";

/**
 * Certificate tools — the credential half of the LMS, which had no MCP surface
 * at all until now (the web app has had one since `20260216000100`).
 *
 * ── WHY THESE GUARD MORE THAN RLS DOES ─────────────────────────────────────
 * The `certificates` policies are unusually loose for this codebase, and the
 * tools here must not lean on them:
 *
 *   - SELECT for staff is `user_roles.role IN ('teacher','admin') OR
 *     courses.author_id = auth.uid()` — an OR, with **no tenant predicate**.
 *     Any teacher can therefore read any tenant's certificates as far as
 *     Postgres is concerned.
 *   - UPDATE (the revoke path) has the same shape.
 *   - INSERT is `user_id = auth.uid() OR <is staff> OR <is author>`, so a
 *     student can technically mint their own row.
 *
 * So every read below carries an explicit `.eq("tenant_id", …)`, and every
 * course-scoped tool runs `verifyCourseOwnership` (staff) or
 * `verifyCourseAccess` (learner) first. Issuance never inserts directly: it
 * calls `issue_certificate_if_eligible`, the SECURITY DEFINER function the
 * lesson/exam triggers use, which re-checks the template criteria server-side.
 * That keeps "who may hold this credential" a database decision rather than
 * something an MCP client can assert.
 *
 * ── THE TEMPLATE GATE ──────────────────────────────────────────────────────
 * `calculate_course_completion` returns `eligible: false, reason: "No active
 * certificate template for this course"` when the course has no active
 * `certificate_templates` row, and `issue_certificate_if_eligible` refuses on
 * the same condition. A course with no template issues nothing, ever, however
 * complete the student is — which is the single most common "why did nobody
 * get a certificate?" answer. `lms_get_certificate_template` /
 * `lms_set_certificate_template` exist so an agent can see and fix that.
 */

// ── Tenant verify-page origin ───────────────────────────────────────────────

/**
 * Public origin the school's certificates verify under.
 *
 * A certificate is only useful if the holder can hand someone a link, and the
 * verify page (`/verify/<code>`) is public. The MCP server has no idea what
 * host it is fronted by, so the origin is derived the same way the app routes
 * tenants: a custom `tenants.domain` if the school has one, otherwise
 * `<slug>.<platform domain>`. With neither configured we return `null` and the
 * widgets show the bare verification code — an unclickable guessed URL is
 * worse than no URL.
 */
const VERIFY_BASE_TTL_MS = 5 * 60 * 1000;
const verifyBaseCache = new Map<string, { at: number; value: string | null }>();

/** Local hosts are served over http; everything else is https. */
export function originForHost(host: string): string {
  const scheme = /^(localhost|127\.0\.0\.1|([\w-]+\.)*lvh\.me)(:\d+)?$/i.test(host)
    ? "http"
    : "https";
  return `${scheme}://${host}`;
}

/** `<origin>/verify/<code>`, or null when we don't know the origin. */
export function verifyUrlFor(base: string | null, code: string | null | undefined): string | null {
  if (!base || !code) return null;
  return `${base}/verify/${encodeURIComponent(code)}`;
}

async function getVerifyBase(session: LmsSession): Promise<string | null> {
  const tenantId = session.getTenantId();
  const hit = verifyBaseCache.get(tenantId);
  if (hit && Date.now() - hit.at < VERIFY_BASE_TTL_MS) return hit.value;

  let value: string | null = null;
  try {
    const { data } = await session
      .getClient()
      .from("tenants")
      .select("slug, domain")
      .eq("id", tenantId)
      .maybeSingle();

    const custom = (data?.domain as string | undefined)?.trim();
    const slug = (data?.slug as string | undefined)?.trim();
    const platform = getPlatformDomain();

    if (custom) value = originForHost(custom);
    else if (slug && platform) value = originForHost(`${slug}.${platform}`);
  } catch {
    // A share link is a nicety. Never fail a tool over it.
  }

  verifyBaseCache.set(tenantId, { at: Date.now(), value });
  return value;
}

// ── Row shaping ─────────────────────────────────────────────────────────────

export type CertificateStatus = "valid" | "expired" | "revoked";

/**
 * Revoked beats expired beats valid.
 *
 * `expires_at` is nullable and usually IS null — `certificate_templates
 * .expiration_days` is optional, and a certificate with no expiry never
 * expires. Only a non-null date in the past demotes a certificate.
 */
export function certificateStatus(
  row: { revoked_at?: string | null; expires_at?: string | null },
  now: Date = new Date()
): CertificateStatus {
  if (row.revoked_at) return "revoked";
  if (row.expires_at && new Date(row.expires_at).getTime() < now.getTime()) return "expired";
  return "valid";
}

/**
 * Resolve student display names by user id.
 *
 * `certificates.user_id` does FK `profiles`, so a PostgREST embed would work
 * here — but `enrollments.user_id` FKs `auth.users` and cannot be embedded, and
 * `lms_list_course_certificates` needs names for both sets. One lookup keyed by
 * id covers both and mirrors `fetchProfileNames` in analytics.ts.
 */
async function fetchProfileNames(
  supabase: SupabaseClient,
  userIds: (string | null | undefined)[]
): Promise<Map<string, string>> {
  const unique = [...new Set(userIds.filter((id): id is string => !!id))];
  const names = new Map<string, string>();
  if (unique.length === 0) return names;
  const { data } = await supabase.from("profiles").select("id, full_name").in("id", unique);
  for (const p of (data as { id: string; full_name: string | null }[] | null) ?? []) {
    const name = p.full_name?.trim();
    if (name) names.set(p.id, name);
  }
  return names;
}

/** Shape of the jsonb both certificate RPCs return. */
interface CompletionSnapshot {
  eligible?: boolean;
  reason?: string;
  completionPercentage?: number;
  totalLessons?: number;
  completedLessons?: number;
  totalExams?: number;
  submittedExams?: number;
  averageExamScore?: number;
  allExamsPassed?: boolean;
  criteria?: {
    minLessonCompletionPct?: number;
    minExamPassScore?: number;
    requiresAllExams?: boolean;
  };
}
interface EligibilityResult {
  success?: boolean;
  eligible?: boolean;
  reason?: string;
  message?: string;
  certificateId?: string;
  verificationCode?: string;
  completion?: CompletionSnapshot;
}

/**
 * One-line human summary of an eligibility result.
 *
 * Exported for tests: the branch that matters is "eligible but no template",
 * which reads as a hard `false` from the RPC and is the only one an agent can
 * actually fix.
 */
export function describeEligibility(result: EligibilityResult | null): string {
  if (!result) return "Eligibility could not be determined.";
  if (result.certificateId && result.reason) {
    return `${result.reason} (certificate ${result.certificateId}).`;
  }
  const c = result.completion ?? {};
  const eligible = result.success === true || result.eligible === true || c.eligible === true;
  if (eligible) return "Eligible — a certificate can be issued now.";

  const reason = result.reason ?? c.reason ?? "Not eligible yet";
  const parts: string[] = [];
  if (typeof c.completedLessons === "number" && typeof c.totalLessons === "number") {
    parts.push(
      `lessons ${c.completedLessons}/${c.totalLessons}` +
        (typeof c.criteria?.minLessonCompletionPct === "number"
          ? ` (needs ${c.criteria.minLessonCompletionPct}%)`
          : "")
    );
  }
  if (typeof c.submittedExams === "number" && typeof c.totalExams === "number") {
    parts.push(`exams ${c.submittedExams}/${c.totalExams}`);
  }
  if (typeof c.averageExamScore === "number" && c.totalExams) {
    parts.push(
      `avg score ${c.averageExamScore}` +
        (typeof c.criteria?.minExamPassScore === "number"
          ? ` (needs ${c.criteria.minExamPassScore})`
          : "")
    );
  }
  return parts.length > 0 ? `${reason}: ${parts.join(", ")}.` : `${reason}.`;
}

// ── Shared guards ───────────────────────────────────────────────────────────

/**
 * Resolve which student a tool is acting on.
 *
 * Omitting `student_id` always means "me". Naming someone else is a staff
 * action: it requires teacher/admin plus ownership of the course, which is what
 * stops a student passing a classmate's id. A learner acting on themselves must
 * still hold course access (`entitlements`, via `has_course_access`) — an
 * `enrollments` row is not an access grant (#543).
 */
async function resolveTargetStudent(
  session: LmsSession,
  courseId: number,
  studentId: string | undefined
): Promise<string> {
  const callerId = session.getUserId();
  const target = studentId?.trim() || callerId;

  if (target === callerId) {
    await session.verifyCourseAccess(courseId);
    return target;
  }

  if (session.getRole() === "student") {
    throw new Error(
      "Students can only act on their own certificates. Omit student_id."
    );
  }
  await session.verifyCourseOwnership(courseId);
  return target;
}

export function registerCertificateTools(server: MCPServer) {
  // ── lms_my_certificates ───────────────────────────────────────────────────
  server.tool(
    {
      name: "lms_my_certificates",
      description:
        "List the caller's own course certificates: course, issue date, validity, verification code and public verify link. Includes revoked and expired ones on request.",
      schema: z.object({
        include_revoked: z
          .boolean()
          .default(false)
          .describe("Include revoked certificates (default: only live ones)"),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      widget: {
        name: "my-certificates",
        invoking: "Loading your certificates...",
        invoked: "Certificates ready",
      },
    },
    async (input, ctx) => {
      let session: LmsSession;
      try {
        session = LmsSession.fromContext(ctx);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      try {
        const supabase = session.getClient();

        let query = supabase
          .from("certificates")
          .select(
            "certificate_id, course_id, verification_code, issued_at, expires_at, revoked_at, revoke_reason, pdf_url, share_count, view_count, courses(title)"
          )
          .eq("user_id", session.getUserId())
          .eq("tenant_id", session.getTenantId())
          .order("issued_at", { ascending: false })
          .limit(100);

        if (!input.include_revoked) query = query.is("revoked_at", null);

        const { data, error } = await query;
        if (error) return errorResult(`Loading certificates: ${error.message}`);

        const base = await getVerifyBase(session);
        const certificates = (data ?? []).map((row) => {
          const course = row.courses as unknown as { title: string } | null;
          return {
            certificate_id: row.certificate_id as string,
            course_id: (row.course_id as number | null) ?? null,
            course_title: course?.title ?? null,
            verification_code: row.verification_code as string,
            verify_url: verifyUrlFor(base, row.verification_code as string),
            pdf_url: (row.pdf_url as string | null) ?? null,
            issued_at: (row.issued_at as string | null) ?? null,
            expires_at: (row.expires_at as string | null) ?? null,
            revoked_at: (row.revoked_at as string | null) ?? null,
            revoke_reason: (row.revoke_reason as string | null) ?? null,
            status: certificateStatus(row as { revoked_at?: string | null; expires_at?: string | null }),
            share_count: (row.share_count as number | null) ?? 0,
            view_count: (row.view_count as number | null) ?? 0,
          };
        });

        const valid = certificates.filter((c) => c.status === "valid").length;

        return widget({
          props: { total: certificates.length, valid, certificates },
          output: text(
            certificates.length === 0
              ? "You have no certificates yet. Finish a course's lessons and exams, then check lms_get_certificate_eligibility for what's still missing."
              : `${certificates.length} certificate(s), ${valid} currently valid.`
          ),
        });
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ── lms_get_certificate_eligibility ───────────────────────────────────────
  server.tool(
    {
      name: "lms_get_certificate_eligibility",
      description:
        "Check whether a student has met a course's certificate criteria (lesson completion %, exam pass score, all-exams rule) and what is still missing. Defaults to the caller; teachers and admins may pass student_id for a student on a course they own.",
      schema: z.object({
        course_id: z.number().int().describe("The course to check"),
        student_id: z
          .string()
          .uuid()
          .optional()
          .describe(
            "Teacher/admin only: the student to check. Omit to check yourself."
          ),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input, ctx) => {
      let session: LmsSession;
      try {
        session = LmsSession.fromContext(ctx);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      try {
        const targetId = await resolveTargetStudent(
          session,
          input.course_id,
          input.student_id
        );
        const supabase = session.getClient();

        // Report the template gate explicitly. The RPC collapses "no template"
        // into a generic not-eligible, which sends agents off optimising a
        // student's completion when the actual blocker is school configuration.
        const { data: template } = await supabase
          .from("certificate_templates")
          .select("template_id, template_name, is_active")
          .eq("course_id", input.course_id)
          .eq("tenant_id", session.getTenantId())
          .maybeSingle();

        const templateActive = !!template && template.is_active !== false;

        const { data, error } = await supabase.rpc("check_and_issue_certificate", {
          p_user_id: targetId,
          p_course_id: input.course_id,
        });
        if (error) return errorResult(`Checking eligibility: ${error.message}`);

        const result = (data ?? null) as EligibilityResult | null;
        const completion = result?.completion ?? {};
        const alreadyIssued = !!result?.certificateId;
        const eligible =
          !alreadyIssued && templateActive && (result?.success === true || result?.eligible === true);

        const summary = !templateActive
          ? `Course ${input.course_id} has no active certificate template, so nothing can be issued. Create one with lms_set_certificate_template.`
          : describeEligibility(result);

        return ok(
          {
            course_id: input.course_id,
            student_id: targetId,
            eligible,
            already_issued: alreadyIssued,
            certificate_id: result?.certificateId ?? null,
            template_configured: templateActive,
            template_name: template?.template_name ?? null,
            completion,
          },
          summary
        );
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ── lms_issue_certificate ─────────────────────────────────────────────────
  server.tool(
    {
      name: "lms_issue_certificate",
      description:
        "Issue a course certificate. Criteria are re-checked in the database, so this succeeds only for a student who has genuinely met the course's template criteria; it is a no-op if one was already issued. Defaults to the caller; teachers and admins may pass student_id for a course they own.",
      schema: z.object({
        course_id: z.number().int().describe("The course to issue for"),
        student_id: z
          .string()
          .uuid()
          .optional()
          .describe(
            "Teacher/admin only: the student to issue to. Omit to issue to yourself."
          ),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input, ctx) => {
      let session: LmsSession;
      try {
        session = LmsSession.fromContext(ctx);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      try {
        const targetId = await resolveTargetStudent(
          session,
          input.course_id,
          input.student_id
        );

        // SECURITY DEFINER, and the same function the lesson-completion and
        // exam-score triggers call. It re-runs the criteria check, resolves the
        // active template (refusing when there is none), generates the
        // verification code and writes the credential JSON. Doing our own
        // INSERT instead would let an MCP client mint a certificate nobody
        // earned — the table's INSERT policy would allow it.
        const { data, error } = await session
          .getClient()
          .rpc("issue_certificate_if_eligible", {
            p_user_id: targetId,
            p_course_id: input.course_id,
          });
        if (error) return errorResult(`Issuing certificate: ${error.message}`);

        const result = (data ?? null) as EligibilityResult | null;

        if (result?.success !== true) {
          const reason = result?.reason ?? "Not eligible for a certificate";
          // A refusal is a legitimate answer here, not a failure: the model
          // should relay *why* and, when it's the template, how to fix it.
          return okText(
            reason.includes("template")
              ? `${reason}. Configure one with lms_set_certificate_template (course_id ${input.course_id}); until then this course issues no certificates at all.`
              : `Certificate not issued — ${describeEligibility(result)}`
          );
        }

        const base = await getVerifyBase(session);
        const code = result.verificationCode ?? null;

        return ok(
          {
            success: true,
            course_id: input.course_id,
            student_id: targetId,
            certificate_id: result.certificateId ?? null,
            verification_code: code,
            verify_url: verifyUrlFor(base, code),
          },
          `Certificate issued${code ? ` — verification code ${code}` : ""}.`
        );
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ── lms_list_course_certificates ──────────────────────────────────────────
  server.tool(
    {
      name: "lms_list_course_certificates",
      description:
        "Teacher/admin view of a course's certificates: the active template and its criteria, every certificate issued (student, date, code), and the enrolled students still awaiting one. Renders an interactive roster that can issue certificates.",
      schema: z.object({
        course_id: z.number().int().describe("The course to inspect"),
        include_revoked: z
          .boolean()
          .default(false)
          .describe("Include revoked certificates in the list"),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      widget: {
        name: "course-certificates",
        invoking: "Loading certificates...",
        invoked: "Certificate roster ready",
      },
    },
    async (input, ctx) => {
      let session: LmsSession;
      try {
        session = LmsSession.fromContext(ctx);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      try {
        await session.verifyCourseOwnership(input.course_id);
        const supabase = session.getClient();
        const tenantId = session.getTenantId();

        const [courseRes, templateRes, certsRes, enrollmentsRes] = await Promise.all([
          supabase
            .from("courses")
            .select("course_id, title")
            .eq("course_id", input.course_id)
            .eq("tenant_id", tenantId)
            .maybeSingle(),
          supabase
            .from("certificate_templates")
            .select(
              "template_id, template_name, issuer_name, is_active, min_lesson_completion_pct, min_exam_pass_score, requires_all_exams, expiration_days"
            )
            .eq("course_id", input.course_id)
            .eq("tenant_id", tenantId)
            .maybeSingle(),
          supabase
            .from("certificates")
            .select(
              "certificate_id, user_id, verification_code, issued_at, expires_at, revoked_at, revoke_reason"
            )
            .eq("course_id", input.course_id)
            .eq("tenant_id", tenantId)
            .order("issued_at", { ascending: false })
            .limit(500),
          supabase
            .from("enrollments")
            .select("user_id")
            .eq("course_id", input.course_id)
            .eq("tenant_id", tenantId)
            .eq("status", "active")
            .limit(500),
        ]);

        if (certsRes.error)
          return errorResult(`Loading certificates: ${certsRes.error.message}`);
        if (!courseRes.data) return errorResult(`Course ${input.course_id} not found`);

        const allCerts = certsRes.data ?? [];
        const enrollments = (enrollmentsRes.data ?? []) as { user_id: string }[];

        const names = await fetchProfileNames(supabase, [
          ...allCerts.map((c) => c.user_id as string | null),
          ...enrollments.map((e) => e.user_id),
        ]);
        const base = await getVerifyBase(session);

        const shaped = allCerts.map((row) => ({
          certificate_id: row.certificate_id as string,
          student_id: (row.user_id as string | null) ?? null,
          student_name: row.user_id ? names.get(row.user_id as string) ?? null : null,
          verification_code: row.verification_code as string,
          verify_url: verifyUrlFor(base, row.verification_code as string),
          issued_at: (row.issued_at as string | null) ?? null,
          expires_at: (row.expires_at as string | null) ?? null,
          revoked_at: (row.revoked_at as string | null) ?? null,
          revoke_reason: (row.revoke_reason as string | null) ?? null,
          status: certificateStatus(row as { revoked_at?: string | null; expires_at?: string | null }),
        }));

        const revoked = shaped.filter((c) => c.status === "revoked").length;
        const certificates = input.include_revoked
          ? shaped
          : shaped.filter((c) => c.status !== "revoked");

        // "Awaiting" is deliberately about live certificates only: a student
        // whose certificate was revoked is back in the queue, which is the
        // whole point of revoking one.
        const holders = new Set(
          shaped.filter((c) => c.status !== "revoked").map((c) => c.student_id)
        );
        const awaiting = enrollments
          .filter((e) => !holders.has(e.user_id))
          .map((e) => ({
            student_id: e.user_id,
            student_name: names.get(e.user_id) ?? null,
          }));

        const t = templateRes.data;
        const template = t
          ? {
              name: t.template_name as string,
              issuer_name: (t.issuer_name as string | null) ?? null,
              is_active: t.is_active !== false,
              min_lesson_completion_pct: (t.min_lesson_completion_pct as number | null) ?? null,
              min_exam_pass_score: (t.min_exam_pass_score as number | null) ?? null,
              requires_all_exams: t.requires_all_exams === true,
              expiration_days: (t.expiration_days as number | null) ?? null,
            }
          : null;

        return widget({
          props: {
            course: {
              id: courseRes.data.course_id as number,
              title: courseRes.data.title as string,
            },
            template,
            summary: {
              issued: shaped.length - revoked,
              revoked,
              active_students: enrollments.length,
              awaiting: awaiting.length,
            },
            certificates,
            awaiting,
          },
          output: text(
            !template || !template.is_active
              ? `Course "${courseRes.data.title}" has no active certificate template, so nothing is issued automatically. ${shaped.length - revoked} certificate(s) exist. Configure the template with lms_set_certificate_template.`
              : `${shaped.length - revoked} certificate(s) issued for "${courseRes.data.title}"; ${awaiting.length} of ${enrollments.length} active student(s) still awaiting one.`
          ),
        });
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ── lms_get_certificate_template ──────────────────────────────────────────
  server.tool(
    {
      name: "lms_get_certificate_template",
      description:
        "Read a course's certificate template: the criteria that decide who earns the credential, plus issuer and design settings. A course with no active template never issues certificates.",
      schema: z.object({
        course_id: z.number().int().describe("The course whose template to read"),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input, ctx) => {
      let session: LmsSession;
      try {
        session = LmsSession.fromContext(ctx);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      try {
        await session.verifyCourseOwnership(input.course_id);

        const { data, error } = await session
          .getClient()
          .from("certificate_templates")
          .select("*")
          .eq("course_id", input.course_id)
          .eq("tenant_id", session.getTenantId())
          .maybeSingle();

        if (error) return errorResult(`Loading template: ${error.message}`);

        if (!data) {
          return okText(
            `Course ${input.course_id} has no certificate template. No certificate can be issued for it — automatic issuance on lesson/exam completion is template-gated. Create one with lms_set_certificate_template.`
          );
        }

        return ok(
          { course_id: input.course_id, template: data as Record<string, unknown> },
          `Template "${data.template_name}"${data.is_active === false ? " (INACTIVE — issues nothing)" : ""}: needs ${data.min_lesson_completion_pct}% of lessons, ${
            data.requires_all_exams
              ? `every exam passed at ${data.min_exam_pass_score}+`
              : `an average exam score of ${data.min_exam_pass_score}+`
          }${data.expiration_days ? `, expires after ${data.expiration_days} days` : ", no expiry"}.`
        );
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ── lms_set_certificate_template ──────────────────────────────────────────
  server.tool(
    {
      name: "lms_set_certificate_template",
      description:
        "Create or update a course's certificate template — the criteria (lesson completion %, exam pass score, all-exams rule, expiry) plus issuer and design details. Only the fields you pass are changed. Activating a template is what enables automatic issuance for the course.",
      schema: z.object({
        course_id: z.number().int().describe("The course this template belongs to"),
        template_name: z
          .string()
          .min(1)
          .max(120)
          .optional()
          .describe("Certificate title, e.g. 'Certificate of Completion'. Required when creating."),
        issuer_name: z
          .string()
          .min(1)
          .max(120)
          .optional()
          .describe("Who issues it — usually the school name. Required when creating."),
        issuer_url: z.string().url().optional().describe("Issuer website shown on the credential"),
        description: z.string().max(2000).optional().describe("What the certificate attests to"),
        issuance_criteria: z
          .string()
          .max(2000)
          .optional()
          .describe("Human-readable criteria printed on the credential"),
        signature_name: z.string().max(120).optional().describe("Name on the signature line"),
        signature_title: z.string().max(120).optional().describe("Title under the signature"),
        logo_url: z.string().url().optional().describe("Logo shown on the certificate"),
        min_lesson_completion_pct: z
          .number()
          .min(0)
          .max(100)
          .optional()
          .describe("Percent of published lessons required (default 100 on create)"),
        min_exam_pass_score: z
          .number()
          .min(0)
          .max(100)
          .optional()
          .describe("Score required per exam, or as an average when requires_all_exams is false (default 70)"),
        requires_all_exams: z
          .boolean()
          .optional()
          .describe(
            "true: every published exam must be submitted and pass. false: the average score is compared instead."
          ),
        expiration_days: z
          .number()
          .int()
          .min(1)
          .nullable()
          .optional()
          .describe("Days until the certificate expires. null for no expiry."),
        is_active: z
          .boolean()
          .optional()
          .describe("Deactivate to stop the course issuing certificates without deleting the template"),
        primary_color: z
          .string()
          .max(32)
          .optional()
          .describe("Certificate primary colour, e.g. '#3B82F6'"),
        secondary_color: z.string().max(32).optional().describe("Certificate secondary colour"),
        show_qr_code: z
          .boolean()
          .optional()
          .describe("Print a QR code linking to the public verify page"),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input, ctx) => {
      let session: LmsSession;
      try {
        session = LmsSession.fromContext(ctx);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      try {
        await session.verifyCourseOwnership(input.course_id);
        const supabase = session.getClient();
        const tenantId = session.getTenantId();

        const { data: existing } = await supabase
          .from("certificate_templates")
          .select("*")
          .eq("course_id", input.course_id)
          .eq("tenant_id", tenantId)
          .maybeSingle();

        const templateName = input.template_name ?? existing?.template_name;
        const issuerName = input.issuer_name ?? existing?.issuer_name;
        if (!templateName || !issuerName) {
          return errorResult(
            "Creating a certificate template needs at least template_name and issuer_name."
          );
        }

        // Read-merge-write rather than a bare upsert: PostgREST's ON CONFLICT
        // updates exactly the columns in the payload, so a partial call would
        // otherwise be indistinguishable from a full one on insert and would
        // reset the design blob (a jsonb column, replaced wholesale) on update.
        const design = {
          ...((existing?.design_settings as Record<string, unknown> | null) ?? {}),
          ...(input.primary_color !== undefined ? { primary_color: input.primary_color } : {}),
          ...(input.secondary_color !== undefined ? { secondary_color: input.secondary_color } : {}),
          ...(input.show_qr_code !== undefined ? { show_qr_code: input.show_qr_code } : {}),
          ...(input.logo_url !== undefined ? { logo_url: input.logo_url } : {}),
        };

        const pick = <T>(next: T | undefined, prev: T | null | undefined, fallback: T): T =>
          next !== undefined ? next : (prev ?? fallback);

        const payload = {
          course_id: input.course_id,
          tenant_id: tenantId,
          template_name: templateName,
          issuer_name: issuerName,
          issuer_url: pick(input.issuer_url, existing?.issuer_url, ""),
          description: pick(input.description, existing?.description, ""),
          issuance_criteria: pick(input.issuance_criteria, existing?.issuance_criteria, ""),
          signature_name: pick(input.signature_name, existing?.signature_name, ""),
          signature_title: pick(input.signature_title, existing?.signature_title, ""),
          logo_url: pick(input.logo_url, existing?.logo_url, ""),
          min_lesson_completion_pct: pick(
            input.min_lesson_completion_pct,
            existing?.min_lesson_completion_pct,
            100
          ),
          min_exam_pass_score: pick(
            input.min_exam_pass_score,
            existing?.min_exam_pass_score,
            70
          ),
          requires_all_exams: pick(
            input.requires_all_exams,
            existing?.requires_all_exams,
            false
          ),
          // Distinct from the others: `null` is a meaningful value (no expiry),
          // so only `undefined` falls back to what is already stored.
          expiration_days:
            input.expiration_days !== undefined
              ? input.expiration_days
              : (existing?.expiration_days ?? null),
          is_active: pick(input.is_active, existing?.is_active, true),
          design_settings: design,
          updated_at: new Date().toISOString(),
          ...(existing ? {} : { created_by: session.getUserId() }),
        };

        const { data, error } = await supabase
          .from("certificate_templates")
          .upsert(payload, { onConflict: "course_id,tenant_id" })
          .select(
            "template_id, template_name, is_active, min_lesson_completion_pct, min_exam_pass_score, requires_all_exams, expiration_days"
          )
          .single();

        if (error) return errorResult(`Saving template: ${error.message}`);

        return ok(
          { course_id: input.course_id, created: !existing, template: data as Record<string, unknown> },
          `${existing ? "Updated" : "Created"} certificate template "${data.template_name}" for course ${input.course_id}${
            data.is_active === false
              ? " (inactive — it issues nothing until is_active is true)"
              : ""
          }. Criteria: ${data.min_lesson_completion_pct}% of lessons, ${
            data.requires_all_exams
              ? `every exam passed at ${data.min_exam_pass_score}+`
              : `average exam score ${data.min_exam_pass_score}+`
          }.`
        );
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ── lms_revoke_certificate ────────────────────────────────────────────────
  server.tool(
    {
      name: "lms_revoke_certificate",
      description:
        "Revoke an issued certificate with a reason. The credential stays on record but verifies as revoked on the public page, and the student re-enters the awaiting list. Admin only.",
      schema: z.object({
        certificate_id: z.string().uuid().describe("The certificate to revoke"),
        reason: z
          .string()
          .min(3)
          .max(500)
          .describe("Why it is being revoked — shown on the public verification page"),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input, ctx) => {
      let session: LmsSession;
      try {
        session = LmsSession.fromContext(ctx);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      try {
        const supabase = session.getClient();

        const { data: cert, error: loadError } = await supabase
          .from("certificates")
          .select("certificate_id, course_id, tenant_id, user_id, revoked_at")
          .eq("certificate_id", input.certificate_id)
          .maybeSingle();

        if (loadError) return errorResult(`Loading certificate: ${loadError.message}`);
        // The SELECT policy for staff carries no tenant predicate, so this
        // check is the one that actually keeps revocation inside the school.
        if (!cert || cert.tenant_id !== session.getTenantId()) {
          return errorResult(`Certificate ${input.certificate_id} not found`);
        }
        if (cert.revoked_at) {
          return okText(
            `Certificate ${input.certificate_id} was already revoked on ${cert.revoked_at}.`
          );
        }
        if (cert.course_id) await session.verifyCourseOwnership(cert.course_id as number);

        const revokedAt = new Date().toISOString();
        const { error } = await supabase
          .from("certificates")
          .update({
            revoked_at: revokedAt,
            revoke_reason: input.reason,
            revoked_by: session.getUserId(),
            updated_at: revokedAt,
          })
          .eq("certificate_id", input.certificate_id)
          .eq("tenant_id", session.getTenantId());

        if (error) return errorResult(`Revoking certificate: ${error.message}`);

        return ok(
          {
            certificate_id: input.certificate_id,
            course_id: cert.course_id ?? null,
            student_id: cert.user_id ?? null,
            revoked_at: revokedAt,
            reason: input.reason,
          },
          `Certificate ${input.certificate_id} revoked: ${input.reason}`
        );
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );
}
