import { useState } from "react";
import { useDynamicTool, useToolContext, useViewTheme } from "mcp-use/react";
import { Brand } from "../shared/branding";
import { useFormat, useStrings } from "../shared/i18n";
import { studentDisplayName, studentInitials } from "../shared/student-display";
import { withWidgetBoundary } from "../shared/error-boundary";
import { type Certificate, type Props } from "./schema";
import "virtual:mcp-use/tailwind.css";

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
    colStatus: "Status",
    tableCaption: (course: string) => `Certificates issued for ${course}`,
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
    colStatus: "Estado",
    tableCaption: (course: string) => `Certificados emitidos de ${course}`,
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

function CourseCertificates() {
  const view = useToolContext();
  const dark = useViewTheme() === "dark";
  // Explicit generics: `mcp-use dev` generates the tool-registry types, and a
  // tool registered in a sibling file is not in them until it regenerates.
  const issueCertificate = useDynamicTool<
    { course_id: number; student_id: string },
    Record<string, unknown>
  >("lms_issue_certificate");
  // One shared hook instance serves every row, so per-row state is tracked here.
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [issuedIds, setIssuedIds] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});

  const t = useStrings(STRINGS);
  const fmt = useFormat();

  // "pending" and "error" both render the loading branch, exactly like v1:
  // an isError result carries no structuredContent, and the transcript already
  // shows the tool's own error text.
  if (view.status !== "ready") {
    return (
      <>
        <Brand />
        <div className={dark ? "dark" : ""}>
          <div className="bg-zinc-50 p-10 text-center font-sans text-zinc-400 dark:bg-zinc-950 dark:text-zinc-500">
            <div className="mx-auto mb-3 size-9 animate-spin rounded-full border-[3px] border-zinc-200 border-t-[var(--brand-600)] dark:border-zinc-800 dark:border-t-[var(--brand-400)]" />
            <p className="m-0 text-sm">{t.loading}</p>
          </div>
        </div>
      </>
    );
  }

  const { course, template, summary, certificates, awaiting } = view.toolOutput as Props;
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
      const result = await issueCertificate.callTool({
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
    <>
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
          {/*
            A real <table>. The column widths were a CSS grid, which meant a
            screen reader got four unlabelled runs of text per certificate with
            no way to tell which was the code and which the date. `table-fixed`
            plus the colgroup below reproduces the grid exactly — two flexible
            columns splitting the remainder, two fixed — so nothing moved.
          */}
          <div className="overflow-x-auto overflow-y-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <table className="w-full min-w-[520px] table-fixed border-collapse text-left">
              <caption className="sr-only">
                {t.tableCaption(course.title)}
              </caption>
              <colgroup>
                <col />
                <col className="w-[104px]" />
                <col />
                <col className="w-[136px]" />
              </colgroup>
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-800">
                  {[
                    { key: "student", label: t.colStudent },
                    { key: "date", label: t.colDate },
                    { key: "code", label: t.colCode },
                    // The actions column has no visible heading; it still needs
                    // a name, or the status pill is announced under nothing.
                    { key: "status", label: t.colStatus, visuallyHidden: true },
                  ].map((col) => (
                    <th
                      key={col.key}
                      scope="col"
                      className="px-4 py-[9px] text-[11px] font-bold tracking-wider text-zinc-500 uppercase first:pl-4 last:pr-4 dark:text-zinc-400"
                    >
                      <span className={col.visuallyHidden ? "sr-only" : undefined}>
                        {col.label}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {certificates.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="p-10 text-center text-zinc-400 dark:text-zinc-500"
                    >
                      <div className="mb-2.5 text-3xl">🎓</div>
                      <p className="m-0 text-sm">{t.noneIssued}</p>
                    </td>
                  </tr>
                ) : (
                  certificates.map((c) => (
                    <tr
                      key={c.certificate_id}
                      className="border-b border-zinc-100 last:border-b-0 dark:border-zinc-800"
                    >
                      {/* The student names the row, so it is a header cell. */}
                      <th scope="row" className="px-4 py-3 font-normal">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span
                            aria-hidden="true"
                            className="flex size-7 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-[11px] font-bold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                          >
                            {studentInitials(c.student_name)}
                          </span>
                          <span className="truncate text-sm text-zinc-900 dark:text-zinc-100">
                            {studentDisplayName(c.student_name, t.unnamed)}
                          </span>
                        </div>
                      </th>
                      <td className="px-4 py-3 text-xs text-zinc-500 tabular-nums dark:text-zinc-400">
                        {fmt.date(c.issued_at)}
                      </td>
                      <td className="px-4 py-3">
                        <code className="block truncate text-[12px] text-zinc-700 dark:text-zinc-300">
                          {c.verification_code}
                        </code>
                      </td>
                      <td className="px-4 py-3">
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
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Awaiting */}
          {awaiting.length > 0 && (
            <>
              <h2 className="mt-6 mb-2 text-[11px] font-bold tracking-wider text-zinc-500 uppercase dark:text-zinc-400">
                {t.awaitingTitle}
              </h2>
              <ul className="m-0 list-none overflow-hidden rounded-xl border border-zinc-200 bg-white p-0 dark:border-zinc-800 dark:bg-zinc-900">
                {awaiting.map((s) => {
                  const done = issuedIds.has(s.student_id);
                  const busy = pendingId === s.student_id;
                  const error = errors[s.student_id];
                  return (
                    <li
                      key={s.student_id}
                      className="border-b border-zinc-100 last:border-b-0 dark:border-zinc-800"
                    >
                      <div className="flex items-center gap-3 px-4 py-2.5">
                        <span
                          aria-hidden="true"
                          className="flex size-7 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-[11px] font-bold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                        >
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
                        <p
                          role="alert"
                          className="mt-0 mr-4 mb-2.5 ml-[54px] rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                        >
                          {error}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      </div>
    </>
  );
}

export default withWidgetBoundary(CourseCertificates);
