import {
  McpUseProvider,
  useWidget,
  useWidgetTheme,
  type WidgetMetadata,
} from "mcp-use/react";
import { Brand } from "../shared/branding";
import { useFormat, useStrings } from "../shared/i18n";
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

const propsSchema = z.object({
  total: z.number(),
  valid: z.number(),
  certificates: z.array(certificateSchema),
});

export const widgetMetadata: WidgetMetadata = {
  description:
    "A student's own course certificates with validity, verification code and public verify link",
  props: propsSchema,
  exposeAsTool: false,
  metadata: {
    invoking: "Loading your certificates...",
    invoked: "Certificates ready",
  },
};

type Props = z.infer<typeof propsSchema>;
type Certificate = z.infer<typeof certificateSchema>;

// ── Strings ──────────────────────────────────────────────────────────────────

const STRINGS = {
  en: {
    loading: "Loading your certificates…",
    title: "My Certificates",
    subtitle: (n: number, count: string) => `${count} certificate${n === 1 ? "" : "s"}`,
    validSuffix: (valid: string) => ` · ${valid} valid`,
    emptyTitle: "No certificates yet",
    emptyHint:
      "Finish a course's lessons and exams and your certificate appears here automatically.",
    issued: "Issued",
    expires: "Expires",
    expired: "Expired",
    revoked: "Revoked",
    valid: "Valid",
    code: "Verification code",
    verify: "Verify page",
    pdf: "PDF",
    views: (n: string) => `${n} views`,
    unknownCourse: "Course",
  },
  es: {
    loading: "Cargando tus certificados…",
    title: "Mis certificados",
    subtitle: (n: number, count: string) => `${count} certificado${n === 1 ? "" : "s"}`,
    validSuffix: (valid: string) => ` · ${valid} vigente(s)`,
    emptyTitle: "Todavía no tienes certificados",
    emptyHint:
      "Termina las lecciones y exámenes de un curso y tu certificado aparecerá aquí automáticamente.",
    issued: "Emitido",
    expires: "Caduca",
    expired: "Caducado",
    revoked: "Revocado",
    valid: "Vigente",
    code: "Código de verificación",
    verify: "Página de verificación",
    pdf: "PDF",
    views: (n: string) => `${n} visitas`,
    unknownCourse: "Curso",
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Status pill colours.
 *
 * The inks are `-700` in light and `-400` in dark: the `-600`/`-500` pairs used
 * elsewhere in this repo fail WCAG AA against these tinted backgrounds.
 */
const PILL: Record<Certificate["status"], string> = {
  valid:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
  expired: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  revoked: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
};

// ── Component ────────────────────────────────────────────────────────────────

export default function MyCertificates() {
  const { props, isPending } = useWidget<Props>();
  const theme = useWidgetTheme();

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

  const { total, valid, certificates } = props;

  const statusLabel = (status: Certificate["status"]) =>
    status === "valid" ? t.valid : status === "expired" ? t.expired : t.revoked;

  return (
    <McpUseProvider autoSize>
      <Brand />
      <div className={dark ? "dark" : ""}>
        <div className="mx-auto max-w-[760px] bg-zinc-50 p-6 font-sans dark:bg-zinc-950">
          <div className="mb-[18px] flex flex-wrap items-baseline justify-between gap-2">
            <h1 className="m-0 text-[22px] font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
              {t.title}
            </h1>
            <span className="text-[13px] text-zinc-500 dark:text-zinc-400">
              {t.subtitle(total, fmt.number(total))}
              {total > 0 ? t.validSuffix(fmt.number(valid)) : ""}
            </span>
          </div>

          {certificates.length === 0 ? (
            <div className="rounded-xl border border-zinc-200 bg-white p-10 text-center dark:border-zinc-800 dark:bg-zinc-900">
              <div className="mb-2 text-3xl">🎓</div>
              <p className="m-0 text-[15px] font-semibold text-zinc-900 dark:text-zinc-100">
                {t.emptyTitle}
              </p>
              <p className="mt-1.5 mb-0 text-[13px] text-zinc-400 dark:text-zinc-500">
                {t.emptyHint}
              </p>
            </div>
          ) : (
            <div className="grid gap-3">
              {certificates.map((c) => (
                <div
                  key={c.certificate_id}
                  className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="m-0 truncate text-[15px] font-semibold text-zinc-900 dark:text-zinc-100">
                        {c.course_title ?? t.unknownCourse}
                      </h2>
                      <p className="mt-1 mb-0 text-xs text-zinc-500 dark:text-zinc-400">
                        {t.issued} {fmt.date(c.issued_at)}
                        {c.expires_at
                          ? ` · ${c.status === "expired" ? t.expired : t.expires} ${fmt.date(c.expires_at)}`
                          : ""}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${PILL[c.status]}`}
                    >
                      {statusLabel(c.status)}
                    </span>
                  </div>

                  {c.status === "revoked" && c.revoke_reason && (
                    <p className="mt-2.5 mb-0 rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700 dark:bg-red-950 dark:text-red-400">
                      {c.revoke_reason}
                    </p>
                  )}

                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
                    <div className="min-w-0">
                      <span className="block text-[10px] font-bold tracking-wider text-zinc-400 uppercase dark:text-zinc-500">
                        {t.code}
                      </span>
                      <code className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300">
                        {c.verification_code}
                      </code>
                    </div>

                    <div className="ml-auto flex items-center gap-3 text-[13px] font-semibold">
                      {c.verify_url && (
                        <a
                          href={c.verify_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[var(--brand-700)] no-underline hover:underline dark:text-[var(--brand-400)]"
                        >
                          {t.verify} ↗
                        </a>
                      )}
                      {c.pdf_url && (
                        <a
                          href={c.pdf_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[var(--brand-700)] no-underline hover:underline dark:text-[var(--brand-400)]"
                        >
                          {t.pdf} ↗
                        </a>
                      )}
                      {c.view_count > 0 && (
                        <span className="text-xs font-normal text-zinc-400 dark:text-zinc-500">
                          {t.views(fmt.number(c.view_count))}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </McpUseProvider>
  );
}
