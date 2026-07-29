import { useState } from "react";
import {
  McpUseProvider,
  useWidget,
  useWidgetTheme,
  useCallTool,
  type WidgetMetadata,
} from "mcp-use/react";
import { Brand } from "../shared/branding";
import { useFormat, useStrings } from "../shared/i18n";
import { studentDisplayName, studentInitials } from "../shared/student-display";
import { z } from "zod";

// ── Schema ──────────────────────────────────────────────────────────────────

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

const propsSchema = z.object({
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

export const widgetMetadata: WidgetMetadata = {
  description:
    "Course certificate roster for teachers: template criteria, issued certificates, and one-click issuance for students still awaiting one",
  props: propsSchema,
  exposeAsTool: false,
  metadata: {
    invoking: "Loading certificates...",
    invoked: "Certificate roster ready",
  },
};

type Props = z.infer<typeof propsSchema>;
type Certificate = z.infer<typeof certificateSchema>;

// ── Strings ──────────────────────────────────────────────────────────────────

const STRINGS = {
  en: {
    loading: "Loading certificates…",
    title: "Certificates",
    statIssued: "Issued",
    statStudents: "Active students",
    statAwaiting: "Awaiting",
    statRevoked: "Revoked",
    noTemplateTitle: "No active certificate template",
    noTemplateBody:
      "This course issues no certificates until a template is configured — automatic issuance on lesson and exam completion is template-gated.",
    inactiveTemplate: "inactive",
    criteria: (pct: string, score: string, all: boolean) =>
      `${pct} of lessons · ${all ? `every exam ≥ ${score}` : `average exam score ≥ ${score}`}`,
    expiry: (days: string) => ` · expires after ${days} days`,
    noExpiry: " · no expiry",
    issuedTitle: "Issued",
    colStudent: "Student",
    colDate: "Date",
    colCode: "Code",
    noneIssued: "No certificates issued yet.",
    awaitingTitle: "Awaiting a certificate",
    issue: "Issue",
    issuing: "Issuing…",
    issued: "Issued ✓",
    verify: "Verify ↗",
    unnamed: "Unnamed student",
    expired: "Expired",
    revoked: "Revoked",
    valid: "Valid",
    issueFailed: "Could not issue — the student has not met the criteria yet.",
  },
  es: {
    loading: "Cargando certificados…",
    title: "Certificados",
    statIssued: "Emitidos",
    statStudents: "Estudiantes activos",
    statAwaiting: "Pendientes",
    statRevoked: "Revocados",
    noTemplateTitle: "Sin plantilla de certificado activa",
    noTemplateBody:
      "Este curso no emite certificados hasta que se configure una plantilla: la emisión automática al completar lecciones y exámenes depende de ella.",
    inactiveTemplate: "inactiva",
    criteria: (pct: string, score: string, all: boolean) =>
      `${pct} de las lecciones · ${all ? `cada examen ≥ ${score}` : `nota media ≥ ${score}`}`,
    expiry: (days: string) => ` · caduca a los ${days} días`,
    noExpiry: " · sin caducidad",
    issuedTitle: "Emitidos",
    colStudent: "Estudiante",
    colDate: "Fecha",
    colCode: "Código",
    noneIssued: "Todavía no se ha emitido ningún certificado.",
    awaitingTitle: "Pendientes de certificado",
    issue: "Emitir",
    issuing: "Emitiendo…",
    issued: "Emitido ✓",
    verify: "Verificar ↗",
    unnamed: "Estudiante sin nombre",
    expired: "Caducado",
    revoked: "Revocado",
    valid: "Vigente",
    issueFailed: "No se pudo emitir: el estudiante aún no cumple los criterios.",
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const PILL: Record<Certificate["status"], string> = {
  valid:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
  expired: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  revoked: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
};

/**
 * The tool's own words for a refusal.
 *
 * `lms_issue_certificate` answers a not-yet-eligible student with a plain-text
 * result rather than an error — the refusal *is* the answer, and it names the
 * missing criterion. Surfacing that text beats a generic failure message, so
 * the fallback only covers a result we cannot read.
 */
function resultText(raw: unknown): string | null {
  const content = (raw as { content?: Array<{ type?: string; text?: string }> } | null)
    ?.content;
  const first = content?.find((c) => typeof c?.text === "string");
  return first?.text?.trim() || null;
}

function didIssue(raw: unknown): boolean {
  const structured = (raw as { structuredContent?: { success?: boolean } } | null)
    ?.structuredContent;
  return structured?.success === true;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function CourseCertificates() {
  const { props, isPending } = useWidget<Props>();
  const theme = useWidgetTheme();
  // Explicit generics: `mcp-use dev` generates the tool-registry types, and a
  // tool registered in a sibling file is not in them until it regenerates.
  const { callToolAsync } = useCallTool<{ course_id: number; student_id: string }>(
    "lms_issue_certificate"
  );
  // One shared hook instance serves every row, so per-row state is tracked here.
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [issuedIds, setIssuedIds] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});

  const dark = theme === "dark";
  const t = useStrings(STRINGS);
  const fmt = useFormat();

  if (isPending) {
    return (
      <McpUseProvider autoSize>
        <Brand />
        <div className={dark ? "dark" : ""}>
          <div className="bg-zinc-50 p-10 text-center font-sans text-zinc-400 dark:bg-zinc-950 dark:text-zinc-500">
            <div className="mx-auto mb-3 size-9 animate-spin rounded-full border-[3px] border-zinc-200 border-t-[var(--brand-600)] dark:border-zinc-800 dark:border-t-[var(--brand-400)]" />
            <p className="m-0 text-sm">{t.loading}</p>
          </div>
        </div>
      </McpUseProvider>
    );
  }

  const { course, template, summary, certificates, awaiting } = props;
  const templateActive = !!template && template.is_active;

  const statusLabel = (status: Certificate["status"]) =>
    status === "valid" ? t.valid : status === "expired" ? t.expired : t.revoked;

  const handleIssue = async (studentId: string) => {
    setPendingId(studentId);
    setErrors((prev) => {
      const next = { ...prev };
      delete next[studentId];
      return next;
    });
    try {
      const result = await callToolAsync({
        course_id: course.id,
        student_id: studentId,
      });
      if (didIssue(result)) {
        setIssuedIds((prev) => new Set(prev).add(studentId));
      } else {
        setErrors((prev) => ({
          ...prev,
          [studentId]: resultText(result) ?? t.issueFailed,
        }));
      }
    } catch {
      setErrors((prev) => ({ ...prev, [studentId]: t.issueFailed }));
    } finally {
      setPendingId(null);
    }
  };

  const stats: Array<{ label: string; value: number; tone: string }> = [
    { label: t.statIssued, value: summary.issued, tone: "text-zinc-900 dark:text-zinc-100" },
    { label: t.statStudents, value: summary.active_students, tone: "text-zinc-900 dark:text-zinc-100" },
    { label: t.statAwaiting, value: summary.awaiting, tone: "text-amber-700 dark:text-amber-400" },
    { label: t.statRevoked, value: summary.revoked, tone: "text-red-700 dark:text-red-400" },
  ];

  return (
    <McpUseProvider autoSize>
      <Brand />
      <div className={dark ? "dark" : ""}>
        <div className="mx-auto max-w-[860px] bg-zinc-50 p-6 font-sans dark:bg-zinc-950">
          {/* Header */}
          <div className="mb-4">
            <h1 className="m-0 text-[22px] font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
              {t.title}
            </h1>
            <p className="mt-0.5 mb-0 text-[13px] text-zinc-500 dark:text-zinc-400">
              {course.title}
            </p>
          </div>

          {/* Stats */}
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {stats.map((s) => (
              <div
                key={s.label}
                className="rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className={`text-xl font-bold tabular-nums ${s.tone}`}>
                  {fmt.number(s.value)}
                </div>
                <div className="mt-0.5 text-[11px] font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
                  {s.label}
                </div>
              </div>
            ))}
          </div>

          {/* Template */}
          {templateActive ? (
            <div className="mb-5 rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {template!.name}
                {template!.issuer_name ? ` · ${template!.issuer_name}` : ""}
              </div>
              <div className="mt-0.5 text-[13px] text-zinc-500 dark:text-zinc-400">
                {t.criteria(
                  fmt.percent(template!.min_lesson_completion_pct ?? 100),
                  fmt.number(template!.min_exam_pass_score ?? 70),
                  template!.requires_all_exams
                )}
                {template!.expiration_days
                  ? t.expiry(fmt.number(template!.expiration_days))
                  : t.noExpiry}
              </div>
            </div>
          ) : (
            <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950">
              <div className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                {t.noTemplateTitle}
                {template && !template.is_active ? ` (${t.inactiveTemplate})` : ""}
              </div>
              <p className="mt-1 mb-0 text-[13px] text-amber-800 dark:text-amber-300">
                {t.noTemplateBody}
              </p>
            </div>
          )}

          {/* Issued */}
          <h2 className="mt-0 mb-2 text-[11px] font-bold tracking-wider text-zinc-500 uppercase dark:text-zinc-400">
            {t.issuedTitle}
          </h2>
          <div className="overflow-x-auto overflow-y-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <div className="grid min-w-[520px] grid-cols-[minmax(150px,1fr)_104px_minmax(140px,1fr)_136px] border-b border-zinc-200 bg-zinc-100 px-4 py-[9px] dark:border-zinc-800 dark:bg-zinc-800">
              {[t.colStudent, t.colDate, t.colCode, ""].map((col, i) => (
                <span
                  key={i}
                  className="text-[11px] font-bold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                >
                  {col}
                </span>
              ))}
            </div>

            {certificates.length === 0 ? (
              <div className="p-10 text-center text-zinc-400 dark:text-zinc-500">
                <div className="mb-2.5 text-3xl">🎓</div>
                <p className="m-0 text-sm">{t.noneIssued}</p>
              </div>
            ) : (
              certificates.map((c, idx) => (
                <div
                  key={c.certificate_id}
                  className={`grid min-w-[520px] grid-cols-[minmax(150px,1fr)_104px_minmax(140px,1fr)_136px] items-center px-4 py-3 ${
                    idx === certificates.length - 1
                      ? ""
                      : "border-b border-zinc-100 dark:border-zinc-800"
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-[11px] font-bold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                      {studentInitials(c.student_name)}
                    </span>
                    <span className="truncate text-sm text-zinc-900 dark:text-zinc-100">
                      {studentDisplayName(c.student_name, t.unnamed)}
                    </span>
                  </div>
                  <span className="text-xs text-zinc-500 tabular-nums dark:text-zinc-400">
                    {fmt.date(c.issued_at)}
                  </span>
                  <code className="truncate text-[12px] text-zinc-700 dark:text-zinc-300">
                    {c.verification_code}
                  </code>
                  <div className="flex items-center justify-end gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${PILL[c.status]}`}
                    >
                      {statusLabel(c.status)}
                    </span>
                    {c.verify_url && (
                      <a
                        href={c.verify_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] font-semibold whitespace-nowrap text-[var(--brand-700)] no-underline hover:underline dark:text-[var(--brand-400)]"
                      >
                        {t.verify}
                      </a>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Awaiting */}
          {awaiting.length > 0 && (
            <>
              <h2 className="mt-6 mb-2 text-[11px] font-bold tracking-wider text-zinc-500 uppercase dark:text-zinc-400">
                {t.awaitingTitle}
              </h2>
              <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
                {awaiting.map((s, idx) => {
                  const done = issuedIds.has(s.student_id);
                  const busy = pendingId === s.student_id;
                  const error = errors[s.student_id];
                  return (
                    <div
                      key={s.student_id}
                      className={
                        idx === awaiting.length - 1
                          ? ""
                          : "border-b border-zinc-100 dark:border-zinc-800"
                      }
                    >
                      <div className="flex items-center gap-3 px-4 py-2.5">
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-[11px] font-bold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                          {studentInitials(s.student_name)}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm text-zinc-900 dark:text-zinc-100">
                          {studentDisplayName(s.student_name, t.unnamed)}
                        </span>
                        {done ? (
                          <span className="text-[13px] font-semibold text-emerald-700 dark:text-emerald-400">
                            {t.issued}
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleIssue(s.student_id)}
                            disabled={busy || !templateActive}
                            className="cursor-pointer rounded-lg bg-[var(--brand-600)] px-3 py-1.5 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {busy ? t.issuing : t.issue}
                          </button>
                        )}
                      </div>
                      {error && (
                        <p className="mt-0 mr-4 mb-2.5 ml-[54px] rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                          {error}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </McpUseProvider>
  );
}
