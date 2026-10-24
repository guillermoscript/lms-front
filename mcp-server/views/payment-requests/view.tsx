import { useState } from "react";
import { useDynamicTool, useToolContext, useViewTheme } from "mcp-use/react";
import { Brand } from "../shared/branding";
import { useFormat, useStrings } from "../shared/i18n";
import { LoadMore, usePagedItems } from "../shared/paging";
import { withWidgetBoundary } from "../shared/error-boundary";
import { ViewPending } from "../shared/view-pending";
import { type PaymentRequest, type Props } from "./schema";
import "virtual:mcp-use/tailwind.css";

// ── Strings ──────────────────────────────────────────────────────────────────

const STRINGS = {
  en: {
    loading: "Loading payment requests…",
    title: "Payment requests",
    subtitle: (n: number, count: string) => `${count} request${n === 1 ? "" : "s"}`,
    emptyTitle: "No payment requests",
    emptyHint: "Manual and bank-transfer payments awaiting review will appear here.",
    unnamed: "Unnamed student",
    asked: "Asked",
    reported: "Student reported",
    noReport: "Nothing reported yet",
    reference: "Ref.",
    mismatch: "Amount differs from the request",
    created: "Requested",
    expired: "Expired",
    expiresIn: (d: string) => `Expires ${d}`,
    expiringSoon: (d: string) => `Expires ${d}`,
    notes: "Notes",
    status: {
      pending: "Pending",
      contacted: "Contacted",
      payment_received: "Paid, awaiting enrolment",
      completed: "Completed",
      cancelled: "Rejected",
    } as Record<string, string>,
    confirm: "Confirm payment",
    reject: "Reject",
    confirmAsk: (amount: string, who: string) => `Confirm ${amount} from ${who}?`,
    rejectAsk: (who: string) => `Reject the request from ${who}?`,
    confirmYes: "Yes, confirm",
    rejectYes: "Yes, reject",
    cancel: "Cancel",
    working: "Working…",
    noteLabel: "Note (optional)",
    reasonLabel: "Reason (optional)",
    verifyHint: "Only confirm after checking the bank or wallet statement.",
    studentNotified: "Student notified",
    studentNotNotified: "Student not notified",
    unchanged: "Already in this state",
    failed: "Could not update this request.",
  },
  es: {
    loading: "Cargando solicitudes de pago…",
    title: "Solicitudes de pago",
    subtitle: (n: number, count: string) => `${count} ${n === 1 ? "solicitud" : "solicitudes"}`,
    emptyTitle: "No hay solicitudes de pago",
    emptyHint: "Los pagos manuales y por transferencia pendientes de revisión aparecerán aquí.",
    unnamed: "Estudiante sin nombre",
    asked: "Solicitado",
    reported: "Informado por el estudiante",
    noReport: "Aún no ha informado el pago",
    reference: "Ref.",
    mismatch: "El importe no coincide con la solicitud",
    created: "Solicitada",
    expired: "Caducada",
    expiresIn: (d: string) => `Caduca ${d}`,
    expiringSoon: (d: string) => `Caduca ${d}`,
    notes: "Notas",
    status: {
      pending: "Pendiente",
      contacted: "Contactado",
      payment_received: "Pagado, falta matricular",
      completed: "Completada",
      cancelled: "Rechazada",
    } as Record<string, string>,
    confirm: "Confirmar pago",
    reject: "Rechazar",
    confirmAsk: (amount: string, who: string) => `¿Confirmar ${amount} de ${who}?`,
    rejectAsk: (who: string) => `¿Rechazar la solicitud de ${who}?`,
    confirmYes: "Sí, confirmar",
    rejectYes: "Sí, rechazar",
    cancel: "Cancelar",
    working: "Procesando…",
    noteLabel: "Nota (opcional)",
    reasonLabel: "Motivo (opcional)",
    verifyHint: "Confirma solo tras revisar el extracto del banco o la cartera.",
    studentNotified: "Estudiante notificado",
    studentNotNotified: "Estudiante no notificado",
    unchanged: "Ya estaba en este estado",
    failed: "No se pudo actualizar esta solicitud.",
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const CONFIRMABLE = ["pending", "contacted"];
const REJECTABLE = ["pending", "contacted", "payment_received"];
const EXPIRING_SOON_DAYS = 2;

const CHIP: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  contacted: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-400",
  payment_received:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
  completed: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  cancelled: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
};

interface Transition {
  status?: string;
  changed?: boolean;
  student_notified?: boolean;
  next_step?: string | null;
}

interface Outcome {
  status: string;
  changed: boolean;
  student_notified: boolean;
  next_step: string | null;
}

type Mode = "confirm" | "reject";

function errorText(raw: unknown): string | null {
  const content = (raw as { content?: Array<{ text?: string }> } | null)?.content;
  return content?.find((c) => typeof c?.text === "string")?.text?.trim() || null;
}

// ── Component ────────────────────────────────────────────────────────────────

function PaymentRequests() {
  const view = useToolContext();
  const dark = useViewTheme() === "dark";
  const t = useStrings(STRINGS);
  const fmt = useFormat();

  const confirmTool = useDynamicTool<
    { request_id: number; admin_notes?: string },
    Record<string, unknown>
  >("lms_confirm_payment_received");
  const rejectTool = useDynamicTool<
    { request_id: number; reason?: string },
    Record<string, unknown>
  >("lms_reject_payment_request");

  // Which row is mid-flow, in which mode, plus its note text.
  const [flow, setFlow] = useState<{ id: number; mode: Mode } | null>(null);
  const [note, setNote] = useState("");
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [outcomes, setOutcomes] = useState<Record<number, Outcome>>({});

  const props = view.status === "ready" ? (view.toolOutput as Props) : undefined;
  const paged = usePagedItems<PaymentRequest>({
    toolName: "lms_list_payment_requests",
    itemsKey: "requests",
    initialItems: props?.requests,
    page: props,
    args: {
      ...(props?.status ? { status: props.status } : {}),
      ...(props?.user_id ? { user_id: props.user_id } : {}),
    },
  });

  if (view.status !== "ready") {
    return (
      <>
        <Brand />
        <div className={dark ? "dark" : ""}>
          <ViewPending view={view} label={t.loading} />
        </div>
      </>
    );
  }

  const { total } = props as Props;
  const requests = paged.items;

  const open = (id: number, mode: Mode) => {
    setFlow({ id, mode });
    setNote("");
    setErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const run = async (r: PaymentRequest, mode: Mode) => {
    setPendingId(r.request_id);
    setErrors((prev) => {
      const next = { ...prev };
      delete next[r.request_id];
      return next;
    });
    try {
      const text = note.trim();
      const result =
        mode === "confirm"
          ? await confirmTool.callTool({
              request_id: r.request_id,
              ...(text ? { admin_notes: text } : {}),
            })
          : await rejectTool.callTool({
              request_id: r.request_id,
              ...(text ? { reason: text } : {}),
            });
      const raw = result as { isError?: boolean; structuredContent?: Transition } | null;
      const body = raw?.structuredContent;
      if (raw?.isError || !body || typeof body.status !== "string") {
        setErrors((prev) => ({
          ...prev,
          [r.request_id]: (raw?.isError ? errorText(raw) : null) ?? t.failed,
        }));
        return;
      }
      setOutcomes((prev) => ({
        ...prev,
        [r.request_id]: {
          status: body.status as string,
          changed: body.changed === true,
          student_notified: body.student_notified === true,
          next_step: body.next_step ?? null,
        },
      }));
      setFlow(null);
      setNote("");
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        [r.request_id]: (err instanceof Error && err.message) || t.failed,
      }));
    } finally {
      setPendingId(null);
    }
  };

  return (
    <>
      <Brand />
      <div className={dark ? "dark" : ""}>
        <div className="mx-auto max-w-[860px] bg-zinc-50 p-6 font-sans dark:bg-zinc-950">
          <div className="mb-[18px] flex flex-wrap items-baseline justify-between gap-2">
            <h1 className="m-0 text-[22px] font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
              {t.title}
            </h1>
            <span className="text-[13px] text-zinc-500 dark:text-zinc-400">
              {t.subtitle(total, fmt.number(total))}
            </span>
          </div>

          {requests.length === 0 ? (
            <div className="rounded-xl border border-zinc-200 bg-white p-10 text-center dark:border-zinc-800 dark:bg-zinc-900">
              <div aria-hidden="true" className="mb-2 text-3xl">
                🏦
              </div>
              <p className="m-0 text-[15px] font-semibold text-zinc-900 dark:text-zinc-100">
                {t.emptyTitle}
              </p>
              <p className="mt-1.5 mb-0 text-[13px] text-zinc-400 dark:text-zinc-500">
                {t.emptyHint}
              </p>
            </div>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {requests.map((r) => {
                const outcome = outcomes[r.request_id];
                const status = outcome?.status ?? r.status;
                const who = r.contact_name || r.contact_email || t.unnamed;
                const askedText = fmt.currency(r.amount, r.currency);
                const hasReport = r.payment_reported_at !== null || r.reported_amount !== null;
                const reportedCurrency = r.reported_currency ?? r.currency;
                const mismatch =
                  r.reported_amount !== null &&
                  r.amount !== null &&
                  (Math.abs(r.reported_amount - r.amount) > 0.005 ||
                    (!!r.reported_currency &&
                      !!r.currency &&
                      r.reported_currency.toLowerCase() !== r.currency.toLowerCase()));
                const days = fmt.daysUntil(r.expires_at);
                const live = CONFIRMABLE.includes(status) || REJECTABLE.includes(status);
                const expired = live && days !== null && days < 0;
                const soon = live && days !== null && days >= 0 && days <= EXPIRING_SOON_DAYS;
                const canConfirm = CONFIRMABLE.includes(status);
                const canReject = REJECTABLE.includes(status);
                const active = flow?.id === r.request_id ? flow.mode : null;
                const busy = pendingId === r.request_id;
                const error = errors[r.request_id];
                const noteId = `pr-note-${r.request_id}`;

                return (
                  <li
                    key={r.request_id}
                    className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                          {who}
                          <span className="ml-2 text-xs font-normal text-zinc-400 tabular-nums dark:text-zinc-500">
                            #{r.request_id}
                          </span>
                        </div>
                        {r.contact_name && r.contact_email && (
                          <div className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                            {r.contact_email}
                          </div>
                        )}
                        <div className="mt-0.5 truncate text-[13px] text-zinc-700 dark:text-zinc-300">
                          {r.item ?? "—"}
                        </div>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                          CHIP[status] ?? CHIP.completed
                        }`}
                      >
                        {t.status[status] ?? status}
                      </span>
                    </div>

                    <dl className="m-0 mt-3 grid grid-cols-1 gap-x-6 gap-y-2 text-[13px] sm:grid-cols-2">
                      <div>
                        <dt className="text-[11px] font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
                          {t.asked}
                        </dt>
                        <dd className="m-0 font-semibold text-zinc-900 tabular-nums dark:text-zinc-100">
                          {askedText}
                          {r.payment_method ? (
                            <span className="ml-1.5 text-xs font-normal text-zinc-500 dark:text-zinc-400">
                              · {r.payment_method}
                            </span>
                          ) : null}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[11px] font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
                          {t.reported}
                        </dt>
                        <dd
                          className={`m-0 tabular-nums ${
                            mismatch
                              ? "font-semibold text-red-700 dark:text-red-400"
                              : "text-zinc-900 dark:text-zinc-100"
                          }`}
                        >
                          {hasReport ? (
                            <>
                              {mismatch && <span aria-hidden="true">⚠ </span>}
                              {fmt.currency(r.reported_amount, reportedCurrency)}
                              {r.payment_reference && (
                                <span className="ml-1.5 text-xs font-normal text-zinc-500 dark:text-zinc-400">
                                  · {t.reference} {r.payment_reference}
                                </span>
                              )}
                              {mismatch && (
                                <span className="block text-xs font-normal">{t.mismatch}</span>
                              )}
                            </>
                          ) : (
                            <span className="text-zinc-400 dark:text-zinc-500">{t.noReport}</span>
                          )}
                        </dd>
                      </div>
                    </dl>

                    <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
                      <span>
                        {t.created} {fmt.date(r.created_at)}
                      </span>
                      {expired ? (
                        <span className="font-semibold text-red-700 dark:text-red-400">
                          {t.expired}
                        </span>
                      ) : soon ? (
                        <span className="font-semibold text-amber-700 dark:text-amber-400">
                          {t.expiringSoon(fmt.relativeDays(days as number))}
                        </span>
                      ) : live && r.expires_at ? (
                        <span>{t.expiresIn(fmt.date(r.expires_at))}</span>
                      ) : null}
                    </div>

                    {r.admin_notes && (
                      <p className="mt-2 mb-0 text-xs text-zinc-500 dark:text-zinc-400">
                        <span className="font-semibold">{t.notes}:</span> {r.admin_notes}
                      </p>
                    )}

                    {outcome && (
                      <p
                        role="status"
                        className="mt-3 mb-0 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                      >
                        {outcome.changed ? "" : `${t.unchanged}. `}
                        {outcome.student_notified ? t.studentNotified : t.studentNotNotified}
                        {outcome.next_step ? ` — ${outcome.next_step}` : ""}
                      </p>
                    )}

                    {error && (
                      <p
                        role="alert"
                        className="mt-3 mb-0 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800 dark:bg-red-950 dark:text-red-300"
                      >
                        {error}
                      </p>
                    )}

                    {(canConfirm || canReject) && !active && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {canConfirm && (
                          <button
                            type="button"
                            onClick={() => open(r.request_id, "confirm")}
                            disabled={pendingId !== null}
                            className="cursor-pointer rounded-lg bg-[var(--brand-600)] px-3 py-1.5 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {t.confirm}
                          </button>
                        )}
                        {canReject && (
                          <button
                            type="button"
                            onClick={() => open(r.request_id, "reject")}
                            disabled={pendingId !== null}
                            className="cursor-pointer rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-[13px] font-semibold text-red-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-red-400"
                          >
                            {t.reject}
                          </button>
                        )}
                      </div>
                    )}

                    {active && (
                      <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-950">
                        <p className="m-0 text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">
                          {active === "confirm" ? t.confirmAsk(askedText, who) : t.rejectAsk(who)}
                        </p>
                        {active === "confirm" && (
                          <p className="mt-1 mb-0 text-xs text-zinc-500 dark:text-zinc-400">
                            {t.verifyHint}
                          </p>
                        )}
                        <label
                          htmlFor={noteId}
                          className="mt-2 block text-xs text-zinc-500 dark:text-zinc-400"
                        >
                          {active === "confirm" ? t.noteLabel : t.reasonLabel}
                        </label>
                        <input
                          id={noteId}
                          type="text"
                          value={note}
                          maxLength={500}
                          onChange={(e) => setNote(e.target.value)}
                          disabled={busy}
                          className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-[13px] text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                        />
                        <div className="mt-2.5 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void run(r, active)}
                            disabled={busy}
                            className={`cursor-pointer rounded-lg px-3 py-1.5 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 ${
                              active === "confirm" ? "bg-[var(--brand-600)]" : "bg-red-700"
                            }`}
                          >
                            {busy ? t.working : active === "confirm" ? t.confirmYes : t.rejectYes}
                          </button>
                          <button
                            type="button"
                            onClick={() => setFlow(null)}
                            disabled={busy}
                            className="cursor-pointer rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-[13px] font-semibold text-zinc-700 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                          >
                            {t.cancel}
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <LoadMore
            shown={requests.length}
            total={total}
            paged={paged}
            formatNumber={fmt.number}
          />
        </div>
      </div>
    </>
  );
}

export default withWidgetBoundary(PaymentRequests);
