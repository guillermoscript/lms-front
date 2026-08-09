"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { IconTrash } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  deletePlatformPlanPrice,
  upsertPlatformPlanPrice,
} from "@/app/actions/platform/plans"
import {
  PLAN_PRICE_CURRENCIES,
  PLAN_PRICE_INTERVALS,
  PLATFORM_BILLING_UI_PROVIDERS,
  providerLabel,
  platformCheckoutReasonLabel,
  type ProviderDiagnostic,
  type PlatformPlanPriceInput,
} from "@/lib/billing/plan-prices"
import {
  PROVIDER_CAPABILITIES,
  type PaymentProvider,
} from "@/lib/payments/types"
import type { PlatformProviderRuntimeStatus } from "@/lib/billing/platform-checkout-availability"
import { evaluatePlatformCheckoutAvailability } from "@/lib/billing/platform-checkout-availability"

interface Props {
  planId: string
  planSlug: string
  /** Every price row for this plan, active or not. */
  prices: PlatformPlanPriceInput[]
  providerDiagnostics?: ProviderDiagnostic[]
  providerStatuses?: Record<string, PlatformProviderRuntimeStatus>
}

const EMPTY_FORM = {
  paymentProvider: PLATFORM_BILLING_UI_PROVIDERS[0] as string,
  interval: "monthly" as string,
  providerPriceId: "",
  currency: "usd" as string,
  amount: "",
  isActive: true,
}

/**
 * Super-admin price management for one platform plan (#602).
 *
 * Until this existed, `platform_plan_prices` (and before #601, the
 * `stripe_price_id_*` columns) had no writer anywhere in the repo — the only
 * documented way to make a plan buyable was a line in `docs/MONETIZATION.md`
 * telling a human to run SQL, which is why every plan 400s on card checkout on
 * any environment where nobody did.
 */
export function PlanPricesEditor({
  planId,
  planSlug,
  prices,
  providerDiagnostics = [],
  providerStatuses = {},
}: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [busyPriceId, setBusyPriceId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const activeCount = prices.filter((p) => p.isActive).length

  // Saving a (provider, interval) that already has a row updates it — the
  // action upserts on the table's unique constraint. Say so, rather than
  // letting a super admin discover it by finding a duplicate that never appears.
  const editingExisting = prices.find(
    (p) => p.paymentProvider === form.paymentProvider && p.interval === form.interval
  )

  // Binance Pay and Solana have no remote catalog to hold a price id (#610), so
  // the field is neither required nor meaningful for them — and an input that
  // demands a value nobody can supply is how placeholder ids get typed in.
  const catalogLess =
    PROVIDER_CAPABILITIES[form.paymentProvider as PaymentProvider]?.createsCatalog === false

  const runtime = providerStatuses[form.paymentProvider]
  const runtimeReason = !runtime?.enabled
    ? "disabled"
    : !runtime?.configured
      ? "missing_credentials"
      : !runtime.ready
        ? "provider_not_ready"
        : null
  const formAvailability = evaluatePlatformCheckoutAvailability({
    provider: form.paymentProvider,
    interval: form.interval,
    price: editingExisting
      ? {
          interval: editingExisting.interval,
          currency: editingExisting.currency,
          providerPriceId: editingExisting.providerPriceId,
          amount: editingExisting.amount,
        }
      : null,
    fallbackAmount: form.amount.trim() === "" ? null : Number(form.amount),
    runtime,
  })
  const formReason =
    formAvailability.reason === "ready" || formAvailability.reason === "missing_price"
      ? runtimeReason
      : formAvailability.reason

  async function handleSave() {
    setSaving(true)
    try {
      const trimmedAmount = form.amount.trim()
      await upsertPlatformPlanPrice({
        planId,
        paymentProvider: form.paymentProvider,
        interval: form.interval,
        providerPriceId: form.providerPriceId,
        currency: form.currency,
        amount: trimmedAmount === "" ? null : Number(trimmedAmount),
        isActive: form.isActive,
      })
      toast.success(editingExisting ? "Price updated" : "Price added")
      setForm(EMPTY_FORM)
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save price")
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleActive(price: PlatformPlanPriceInput) {
    setBusyPriceId(price.priceId)
    try {
      await upsertPlatformPlanPrice({
        planId,
        paymentProvider: price.paymentProvider,
        interval: price.interval,
        providerPriceId: price.providerPriceId,
        currency: price.currency,
        amount: price.amount,
        isActive: !price.isActive,
      })
      toast.success(price.isActive ? "Price deactivated" : "Price activated")
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update price")
    } finally {
      setBusyPriceId(null)
    }
  }

  async function handleDelete(price: PlatformPlanPriceInput) {
    setBusyPriceId(price.priceId)
    try {
      await deletePlatformPlanPrice(price.priceId)
      toast.success("Price removed")
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove price")
    } finally {
      setBusyPriceId(null)
    }
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
        className="flex-1"
        data-testid="plan-prices-btn"
      >
        Prices{activeCount > 0 ? ` (${activeCount})` : ""}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl" data-testid="plan-prices-dialog">
          <DialogHeader>
            <DialogTitle>Provider prices — {planSlug}</DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            <p className="text-xs text-muted-foreground">
              A plan is only purchasable through a provider with an active, executable price here.
              Paste the id the provider generated (Stripe <code className="font-mono">price_…</code>,
              Lemon Squeezy variant id); this app never creates it for you.
            </p>

            <div>
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Configured prices
              </p>
              {prices.length === 0 ? (
                <p
                  className="rounded-md border border-dashed p-4 text-sm text-muted-foreground"
                  data-testid="plan-prices-empty"
                >
                  No prices configured — this plan cannot be bought through any provider.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                        <th className="pb-2 font-medium">Provider</th>
                        <th className="pb-2 font-medium">Interval</th>
                        <th className="pb-2 font-medium">Price ID</th>
                        <th className="pb-2 font-medium">Amount</th>
                        <th className="pb-2 font-medium">Status</th>
                        <th className="pb-2 font-medium">Active</th>
                        <th className="pb-2" aria-label="Actions" />
                      </tr>
                    </thead>
                    <tbody>
                      {prices.map((price) => (
                        <tr
                          key={price.priceId}
                          className="border-b last:border-0"
                          data-testid="plan-price-row"
                          data-provider={price.paymentProvider}
                          data-interval={price.interval}
                        >
                          <td className="py-2.5 font-medium">
                            {providerLabel(price.paymentProvider)}
                          </td>
                          <td className="py-2.5 capitalize text-muted-foreground">
                            {price.interval}
                          </td>
                          <td className="max-w-[14rem] truncate py-2.5 font-mono text-xs">
                            {price.providerPriceId ?? (
                              <span className="text-muted-foreground">no catalog</span>
                            )}
                          </td>
                          <td className="py-2.5 tabular-nums text-muted-foreground">
                            {price.amount === null
                              ? "—"
                              : `${price.amount} ${price.currency.toUpperCase()}`}
                          </td>
                          <td className="py-2.5">
                            {(() => {
                              const diagnostic = providerDiagnostics.find(
                                (item) => item.provider === price.paymentProvider,
                              )
                              const unavailable = diagnostic?.unavailable.find(
                                (item) => item.interval === price.interval,
                              )
                              return unavailable ? (
                                <Badge variant="destructive" className="text-[10px]">
                                  {platformCheckoutReasonLabel(unavailable.reason)}
                                </Badge>
                              ) : diagnostic?.availableIntervals.includes(price.interval as "monthly" | "yearly") ? (
                                <Badge variant="secondary" className="text-[10px]">Ready</Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground">Not evaluated</span>
                              )
                            })()}
                          </td>
                          <td className="py-2.5">
                            <Switch
                              checked={price.isActive}
                              disabled={busyPriceId === price.priceId}
                              onCheckedChange={() => handleToggleActive(price)}
                              aria-label={`${price.isActive ? "Deactivate" : "Activate"} ${providerLabel(price.paymentProvider)} ${price.interval} price`}
                              data-testid="plan-price-active-toggle"
                            />
                          </td>
                          <td className="py-2.5 text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busyPriceId === price.priceId}
                              onClick={() => handleDelete(price)}
                              aria-label={`Remove ${providerLabel(price.paymentProvider)} ${price.interval} price`}
                              data-testid="plan-price-delete-btn"
                            >
                              <IconTrash className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="space-y-4 border-t pt-4">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {editingExisting ? "Update price" : "Add price"}
              </p>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor={`provider-${planId}`}>Provider</Label>
                  <Select
                    value={form.paymentProvider}
                    onValueChange={(v) => v && setForm((p) => ({ ...p, paymentProvider: v }))}
                  >
                    <SelectTrigger id={`provider-${planId}`} className="w-full" data-testid="plan-price-provider-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PLATFORM_BILLING_UI_PROVIDERS.map((provider) => (
                        <SelectItem key={provider} value={provider}>
                          {providerLabel(provider)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor={`interval-${planId}`}>Interval</Label>
                  <Select
                    value={form.interval}
                    onValueChange={(v) => v && setForm((p) => ({ ...p, interval: v }))}
                  >
                    <SelectTrigger id={`interval-${planId}`} className="w-full" data-testid="plan-price-interval-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PLAN_PRICE_INTERVALS.map((interval) => (
                        <SelectItem key={interval} value={interval}>
                          <span className="capitalize">{interval}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor={`price-id-${planId}`}>
                  Provider price ID{catalogLess ? " (not used)" : ""}
                </Label>
                <Input
                  id={`price-id-${planId}`}
                  name={`provider-price-id-${planId}`}
                  className="font-mono text-xs"
                  placeholder={catalogLess ? "No catalog — leave blank" : "price_1234…"}
                  value={form.providerPriceId}
                  onChange={(e) => setForm((p) => ({ ...p, providerPriceId: e.target.value }))}
                  disabled={catalogLess}
                  data-testid="plan-price-id-input"
                  autoComplete="off"
                  spellCheck={false}
                />
                {catalogLess && (
                  <p className="text-xs text-muted-foreground">
                    {providerLabel(form.paymentProvider)} has no product catalog to point at. Set the
                    amount below instead — it is what the school is charged.
                  </p>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor={`currency-${planId}`}>Currency</Label>
                  <Select
                    value={form.currency}
                    onValueChange={(v) => v && setForm((p) => ({ ...p, currency: v }))}
                  >
                    <SelectTrigger id={`currency-${planId}`} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PLAN_PRICE_CURRENCIES.map((currency) => (
                        <SelectItem key={currency} value={currency}>
                          {currency.toUpperCase()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor={`amount-${planId}`}>Amount</Label>
                  <Input
                    id={`amount-${planId}`}
                    name={`amount-${planId}`}
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    placeholder="Optional…"
                    value={form.amount}
                    onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
                    data-testid="plan-price-amount-input"
                    autoComplete="off"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor={`active-${planId}`}>Active</Label>
                  <div className="flex h-9 items-center">
                    <Switch
                      id={`active-${planId}`}
                      checked={form.isActive}
                      onCheckedChange={(checked) => setForm((p) => ({ ...p, isActive: checked }))}
                    />
                  </div>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                {editingExisting
                  ? `Saving overwrites the existing ${providerLabel(form.paymentProvider)} ${form.interval} price.`
                  : "Leave the amount blank when the provider charges the plan's listed price."}
              </p>
              {runtimeReason && (
                <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                  {platformCheckoutReasonLabel(runtimeReason)}. This price will not make the plan
                  purchasable until the provider is ready.
                </p>
              )}
              {formReason && formReason !== runtimeReason && (
                <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                  {platformCheckoutReasonLabel(formReason)}. The saved row will remain visible for
                  diagnosis but cannot satisfy platform purchasability.
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Close
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || (!catalogLess && form.providerPriceId.trim() === "")}
              data-testid="plan-price-save-btn"
            >
              {saving ? "Saving…" : editingExisting ? "Update price" : "Add price"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** Small read-only summary rendered on the plan card itself. */
export function PlanPurchasabilityBadge({
  isPaid,
  isPurchasable,
  providers,
  missingIntervals,
  diagnostics,
}: {
  isPaid: boolean
  isPurchasable: boolean
  providers: { provider: string; intervals: string[] }[]
  missingIntervals: string[]
  diagnostics?: ProviderDiagnostic[]
}) {
  if (!isPaid) {
    return (
      <p className="text-xs text-muted-foreground" data-testid="plan-purchasability">
        Free plan — no provider price needed.
      </p>
    )
  }

  if (!isPurchasable) {
    return (
      <p
        className="text-xs font-medium text-red-700 dark:text-red-400"
        data-testid="plan-purchasability"
        data-purchasable="false"
      >
        Not purchasable — no executable automated provider. Manual transfer remains a separate
        fallback.
        {diagnostics && diagnostics.length > 0 && (
          <span className="mt-1 block font-normal">
            {diagnostics
              .flatMap((diagnostic) =>
                diagnostic.unavailable.map(
                  ({ interval, reason }) =>
                    `${providerLabel(diagnostic.provider)} ${interval}: ${platformCheckoutReasonLabel(reason)}`,
                ),
              )
              .join(" · ")}
          </span>
        )}
      </p>
    )
  }

  return (
    <div className="space-y-1" data-testid="plan-purchasability" data-purchasable="true">
      <p className="text-xs text-muted-foreground">
        Purchasable via{" "}
        {providers
          .map((p) => `${providerLabel(p.provider)} (${p.intervals.join(", ")})`)
          .join(" · ")}
      </p>
      {missingIntervals.length > 0 && (
        <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
          No price for {missingIntervals.join(" or ")} — that interval is advertised but unbuyable.
        </p>
      )}
    </div>
  )
}

export function PlanPurchasabilityChip({ isPurchasable }: { isPurchasable: boolean }) {
  return isPurchasable ? null : (
    <Badge variant="destructive" className="text-[10px]" data-testid="plan-unpurchasable-chip">
      Unavailable
    </Badge>
  )
}
