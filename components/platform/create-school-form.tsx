'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { IconCheck, IconCopy, IconExternalLink } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CountryPicker } from '@/components/shared/country-picker'
import { BillingModeFields, type BillingFieldsValue } from '@/components/platform/billing-mode-fields'
import { createSchoolOnBehalf } from '@/app/actions/platform/create-school-on-behalf'
import type { CreateSchoolOnBehalfResult } from '@/lib/tenant/create-school-on-behalf'
import type { BillingMode } from '@/lib/billing/billing-mode'
import { INTERNAL_PLAN_SLUG, type BillingModeField } from '@/lib/billing/billing-mode-input'
import { SCHOOL_CURRENCIES, defaultCurrencyForCountry, type CountryCode } from '@/lib/countries'

const CREATE_MODES: readonly BillingMode[] = ['paid', 'comped', 'internal']

const HELP_OVERRIDES: Partial<Record<BillingMode, string>> = {
  paid: 'Normal billing: subscription, fee ledger and cutoffs apply from the start.',
}

type FieldKey = 'name' | 'slug' | 'country' | 'currency' | 'ownerEmail' | BillingModeField
type Errors = Partial<Record<FieldKey, string>>
type Success = Extract<CreateSchoolOnBehalfResult, { ok: true }>

const generateSlug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

const PLATFORM_DOMAIN = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN || 'lmsplatform.com'

const INITIAL_BILLING: BillingFieldsValue = { mode: 'paid', plan: 'enterprise', until: '', fee: '0', reason: '' }

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p id={id} role="alert" className="text-xs text-destructive">
      {message}
    </p>
  ) : null
}

export function CreateSchoolForm() {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [country, setCountry] = useState<CountryCode | null>(null)
  const [currency, setCurrency] = useState('')
  const [currencyEdited, setCurrencyEdited] = useState(false)
  const [ownerEmail, setOwnerEmail] = useState('')
  const [billing, setBilling] = useState<BillingFieldsValue>(INITIAL_BILLING)
  const [errors, setErrors] = useState<Errors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [success, setSuccess] = useState<Success | null>(null)
  const [copied, setCopied] = useState(false)
  const [pending, startTransition] = useTransition()

  const isInternal = billing.mode === 'internal'

  function onNameChange(value: string) {
    setName(value)
    if (!slugEdited) setSlug(generateSlug(value))
  }

  function onCountryChange(next: CountryCode | null) {
    setCountry(next)
    if (!currencyEdited) setCurrency(defaultCurrencyForCountry(next) ?? '')
  }

  function reset() {
    setName('')
    setSlug('')
    setSlugEdited(false)
    setCountry(null)
    setCurrency('')
    setCurrencyEdited(false)
    setOwnerEmail('')
    setBilling(INITIAL_BILLING)
    setErrors({})
    setFormError(null)
    setSuccess(null)
    setCopied(false)
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (pending) return
    setErrors({})
    setFormError(null)
    startTransition(async () => {
      try {
        const result = await createSchoolOnBehalf({
          name,
          slug,
          country,
          currency: currency || null,
          ownerEmail: isInternal ? null : ownerEmail,
          mode: billing.mode,
          plan: billing.mode === 'comped' ? billing.plan : isInternal ? INTERNAL_PLAN_SLUG : null,
          comped_until: billing.mode === 'comped' ? billing.until || null : null,
          fee_percent_override: billing.mode === 'comped' ? billing.fee : null,
          reason: billing.mode === 'paid' ? null : billing.reason,
        })
        if (result.ok) {
          setSuccess(result)
        } else {
          setErrors(result.errors ?? {})
          setFormError(result.error ?? (Object.keys(result.errors ?? {}).length ? 'Fix the highlighted fields and try again.' : null))
        }
      } catch (err) {
        setFormError(err instanceof Error ? err.message : 'Failed to create the school')
      }
    })
  }

  async function copyJoinUrl(url: string) {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }
    } catch {
      /* clipboard unavailable (http / permissions): the link stays selectable */
    }
  }

  if (success) {
    const { owner } = success
    return (
      <div className="space-y-5" data-testid="create-school-success" role="status">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{name} is ready</h2>
          <a
            href={success.siteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-1 break-all text-sm text-primary underline-offset-4 hover:underline"
            data-testid="create-school-site-url"
          >
            {success.siteUrl}
            <IconExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
          </a>
        </div>

        <div className="space-y-2 text-sm" data-testid="create-school-owner-status">
          {owner.kind === 'self' && <p>You are the admin.</p>}
          {owner.kind === 'member_added' && (
            <p>
              <span className="font-medium">{owner.email}</span> was added as admin.
            </p>
          )}
          {owner.kind === 'invited' && owner.emailSent !== false && (
            <p>
              Invitation sent to <span className="font-medium">{owner.email}</span>.
            </p>
          )}
          {owner.kind === 'invited' && owner.emailSent === false && (
            <p>
              Email not sent — share this link with <span className="font-medium">{owner.email}</span>.
            </p>
          )}
          {owner.kind === 'invited' && owner.joinUrl && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                readOnly
                value={owner.joinUrl}
                aria-label="Invitation link"
                onFocus={(e) => e.currentTarget.select()}
                data-testid="create-school-join-url"
              />
              <Button type="button" variant="outline" onClick={() => copyJoinUrl(owner.joinUrl!)}>
                {copied ? <IconCheck aria-hidden="true" /> : <IconCopy aria-hidden="true" />}
                {copied ? 'Copied' : 'Copy link'}
              </Button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={reset} data-testid="create-school-another">
            Create another
          </Button>
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href="../tenants" />}
            data-testid="create-school-back"
          >
            Back to schools
          </Button>
        </div>
      </div>
    )
  }

  const describe = (key: FieldKey, extra?: string) =>
    [errors[key] ? `create-school-${key}-error` : null, extra].filter(Boolean).join(' ') || undefined

  return (
    <form onSubmit={submit} noValidate className="space-y-5" data-testid="create-school-form">
      <div className="space-y-1.5">
        <Label htmlFor="create-school-name">School name</Label>
        <Input
          id="create-school-name"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          disabled={pending}
          autoComplete="off"
          data-testid="create-school-name"
          aria-invalid={!!errors.name}
          aria-describedby={describe('name')}
        />
        <FieldError id="create-school-name-error" message={errors.name} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="create-school-slug">URL slug</Label>
        <Input
          id="create-school-slug"
          value={slug}
          onChange={(e) => {
            setSlugEdited(true)
            setSlug(generateSlug(e.target.value))
          }}
          disabled={pending}
          autoComplete="off"
          spellCheck={false}
          className="font-mono"
          data-testid="create-school-slug"
          aria-invalid={!!errors.slug}
          aria-describedby={describe('slug', 'create-school-slug-hint')}
        />
        <p id="create-school-slug-hint" className="break-all text-xs text-muted-foreground">
          {slug || 'your-school'}.{PLATFORM_DOMAIN}
        </p>
        <FieldError id="create-school-slug-error" message={errors.slug} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="create-school-country">Country (optional)</Label>
          <CountryPicker
            id="create-school-country"
            value={country}
            onValueChange={onCountryChange}
            placeholder="Select a country"
            emptyText="No country found"
            disabled={pending}
            data-testid="create-school-country"
            aria-describedby={describe('country')}
          />
          <FieldError id="create-school-country-error" message={errors.country} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="create-school-currency">Currency</Label>
          <Select
            value={currency}
            onValueChange={(v) => {
              if (!v) return
              setCurrencyEdited(true)
              setCurrency(v)
            }}
            disabled={pending}
          >
            <SelectTrigger
              id="create-school-currency"
              data-testid="create-school-currency"
              aria-invalid={!!errors.currency}
              aria-describedby={describe('currency')}
            >
              <SelectValue placeholder="Auto from country" />
            </SelectTrigger>
            <SelectContent>
              {SCHOOL_CURRENCIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError id="create-school-currency-error" message={errors.currency} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="create-school-owner-email">Owner email</Label>
        <Input
          id="create-school-owner-email"
          type="email"
          value={isInternal ? '' : ownerEmail}
          onChange={(e) => setOwnerEmail(e.target.value)}
          disabled={pending || isInternal}
          autoComplete="off"
          placeholder={isInternal ? 'You' : 'owner@example.com'}
          data-testid="create-school-owner-email"
          aria-invalid={!!errors.ownerEmail}
          aria-describedby={describe('ownerEmail', 'create-school-owner-hint')}
        />
        <p id="create-school-owner-hint" className="text-xs text-muted-foreground">
          {isInternal
            ? 'Internal schools are owned by you: you become the admin, no invitation is sent.'
            : 'Existing users are added as admin; everyone else gets an invitation.'}
        </p>
        <FieldError id="create-school-ownerEmail-error" message={errors.ownerEmail} />
      </div>

      <fieldset className="space-y-4 border-t border-border pt-5" disabled={pending}>
        <legend className="sr-only">Billing</legend>
        <p className="text-sm font-medium" aria-hidden="true">
          Billing
        </p>
        <BillingModeFields
          value={billing}
          onChange={(patch) => setBilling((prev) => ({ ...prev, ...patch }))}
          errors={errors}
          modes={CREATE_MODES}
          planModes={['comped']}
          helpOverrides={HELP_OVERRIDES}
          pinInternalPlan
          disabled={pending}
        />
      </fieldset>

      {formError && (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          data-testid="create-school-error"
        >
          {formError}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending} data-testid="create-school-submit">
          {pending ? 'Creating…' : 'Create school'}
        </Button>
        <Button variant="outline" nativeButton={false} render={<Link href="../tenants" />} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
