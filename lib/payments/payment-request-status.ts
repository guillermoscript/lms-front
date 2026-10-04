/**
 * The one status vocabulary for a manual payment request.
 *
 * The lifecycle is `pending → contacted → payment_received → completed`, with
 * `cancelled` as the terminal failure. Two admin screens render it — the
 * requests table and the request detail header — and before #764 they disagreed
 * (a tinted pill in the table, a solid palette fill with light text in the
 * header), so the row an admin clicked did not look like the page it opened.
 * Both now read this map.
 *
 * Why these five fills:
 * - `pending` is the platform's caution state: the request is waiting on the
 *   admin, and that is the same caution every other queue in the product uses.
 * - `contacted` is deliberately neutral. It is the "ball is in the student's
 *   court" state, and a second brand-ish hue here would make it indistinguishable
 *   from `payment_received` in the All tab.
 * - `payment_received` carries the school's own tint: it is the one step from
 *   done, the state the admin is about to act on.
 * - `completed` and `cancelled` are fixed platform outcomes and must read the
 *   same on every tenant, whatever colour the school picked.
 *
 * Each pill sets its own border tone, because the callers render a `Badge` with
 * the outline variant, whose neutral border would otherwise show. `pending`
 * and `completed` match the warning/success tints used elsewhere (payouts,
 * transactions); `cancelled` is a paler, bordered fill by design — those
 * screens' bare `destructive` Badge gets a heavier fill in dark mode, while an
 * outline Badge carries no dark twin (D13). `contacted` keeps the neutral
 * border on purpose — it *is* the neutral state.
 *
 * An unknown status resolves to `undefined`, which leaves the outline variant's
 * own neutral styling showing. That is the intended fallback if the enum grows.
 */
export const PAYMENT_REQUEST_STATUS_STYLES: Record<string, string> = {
  pending: 'border-warning/30 bg-warning/10 text-warning',
  contacted: 'border-border bg-muted text-foreground',
  payment_received: 'border-primary/20 bg-brand-tint text-brand-text',
  completed: 'border-success/30 bg-success/10 text-success',
  cancelled: 'border-destructive/30 bg-destructive/10 text-destructive',
}
