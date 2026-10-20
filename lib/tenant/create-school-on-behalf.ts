import type { SupabaseClient } from '@supabase/supabase-js'
import { reconcileAccessCutoffSafely } from '@/lib/billing/access-cutoff'
import { validateBillingModeInput } from '@/lib/billing/billing-mode-input'
import { syncTenantPlan } from '@/lib/billing/sync-tenant-plan'
import { defaultCurrencyForCountry } from '@/lib/countries'
import { getTenantSiteUrl } from '@/lib/platform/tenant-site-url'
import { issueInvitation } from '@/lib/tenant/invitations'
import { setActiveTenant } from '@/lib/tenant/join-school'
import { SLUG_TAKEN_MESSAGE, validateSchoolSlug } from '@/lib/tenant/school-slug'

/**
 * Super admin: create a school already in a billing mode and hand it to its
 * owner (#984, docs/INTERNAL_COMPED_SCHOOLS.md). The admin client is injected so
 * the whole flow is unit-testable; the 'use server' wrapper authorises.
 */

export interface CreateSchoolOnBehalfInput {
  name: string
  slug: string
  country?: string | null
  currency?: string | null
  ownerEmail?: string | null
  mode: string
  plan?: string | null
  comped_until?: string | null
  fee_percent_override?: number | string | null
  reason?: string | null
}

export type CreateSchoolOnBehalfField =
  | 'name'
  | 'slug'
  | 'country'
  | 'currency'
  | 'ownerEmail'
  | 'mode'
  | 'plan'
  | 'comped_until'
  | 'fee_percent_override'
  | 'reason'

export type CreateSchoolOnBehalfResult =
  | {
      ok: true
      tenantId: string
      slug: string
      siteUrl: string
      owner: {
        kind: 'self' | 'member_added' | 'invited'
        email: string
        emailSent?: boolean
        joinUrl?: string
      }
    }
  | {
      ok: false
      errors: Partial<Record<CreateSchoolOnBehalfField, string>>
      error?: string
    }

const NAME_MIN = 2
const NAME_MAX = 100
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const LIST_USERS_PAGE_SIZE = 1000
const LIST_USERS_MAX_PAGES = 100

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

/**
 * Exact (case-insensitive) auth user lookup by email. `auth.admin` has no
 * lookup-by-email and `profiles` carries no email, so this pages `listUsers`.
 * Super-admin-only and rare; capped so a runaway instance cannot hang the action.
 */
export async function findAuthUserIdByEmail(admin: SupabaseClient, email: string): Promise<string | null> {
  const wanted = email.toLowerCase()
  for (let page = 1; page <= LIST_USERS_MAX_PAGES; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: LIST_USERS_PAGE_SIZE })
    if (error) throw new Error(`Failed to look up owner: ${error.message}`)
    const users = data?.users ?? []
    const hit = users.find((u) => u.email?.toLowerCase() === wanted)
    if (hit) return hit.id
    if (users.length < LIST_USERS_PAGE_SIZE) return null
  }
  throw new Error('Failed to look up owner: too many users to scan')
}

export async function createSchoolOnBehalfCore({
  admin,
  superAdminId,
  input,
  now = new Date(),
}: {
  admin: SupabaseClient
  superAdminId: string
  input: CreateSchoolOnBehalfInput
  now?: Date
}): Promise<CreateSchoolOnBehalfResult> {
  const errors: Partial<Record<CreateSchoolOnBehalfField, string>> = {}

  const name = str(input.name)
  if (name.length < NAME_MIN || name.length > NAME_MAX) {
    errors.name = `Name must be ${NAME_MIN}-${NAME_MAX} characters`
  }

  const slugCheck = validateSchoolSlug(input.slug)
  if (!slugCheck.ok) errors.slug = slugCheck.error

  const countryRaw = str(input.country).toUpperCase()
  let country: string | null = null
  if (countryRaw) {
    if (/^[A-Z]{2}$/.test(countryRaw)) country = countryRaw
    else errors.country = 'Country must be a 2-letter ISO code'
  }

  const currencyRaw = str(input.currency).toUpperCase()
  let currency: string | null = null
  if (currencyRaw) {
    if (/^[A-Z]{3}$/.test(currencyRaw)) currency = currencyRaw
    else errors.currency = 'Currency must be a 3-letter ISO code'
  } else if (country) {
    currency = defaultCurrencyForCountry(country)
  }

  const billing = validateBillingModeInput(
    {
      mode: input.mode,
      plan: input.plan,
      comped_until: input.comped_until,
      fee_percent_override: input.fee_percent_override,
      reason: input.reason,
    },
    now,
  )
  if (!billing.ok) Object.assign(errors, billing.errors)

  // internal: the super admin owns it themself, any ownerEmail is ignored.
  const isInternal = billing.ok && billing.value.mode === 'internal'
  const ownerEmailRaw = str(input.ownerEmail).toLowerCase()
  let ownerEmail = ''
  if (!isInternal) {
    if (!ownerEmailRaw) errors.ownerEmail = 'Owner email is required'
    else if (!EMAIL_SHAPE.test(ownerEmailRaw)) errors.ownerEmail = 'Enter a valid email'
    else ownerEmail = ownerEmailRaw
  }

  if (Object.keys(errors).length > 0 || !billing.ok || !slugCheck.ok) {
    return { ok: false, errors }
  }
  const slug = slugCheck.slug
  const v = billing.value

  // Case-insensitive uniqueness (slugs are matched exactly by the proxy, but
  // 'Acme' and 'acme' must not both exist). The insert's 23505 covers the race.
  const { data: taken, error: takenError } = await admin
    .from('tenants')
    .select('id')
    .ilike('slug', slug)
    .limit(1)
    .maybeSingle()
  if (takenError) return { ok: false, errors: {}, error: `Failed to check slug: ${takenError.message}` }
  if (taken) return { ok: false, errors: { slug: SLUG_TAKEN_MESSAGE } }

  const nowIso = now.toISOString()
  const { data: tenant, error: insertError } = await admin
    .from('tenants')
    .insert({
      name,
      slug,
      status: 'active',
      country,
      billing_mode: v.mode,
      comped_until: v.mode === 'paid' ? null : v.comped_until,
      comped_reason: v.mode === 'paid' ? null : v.reason,
      comped_by: v.mode === 'paid' ? null : superAdminId,
      comped_at: v.mode === 'paid' ? null : nowIso,
      fee_percent_override: v.mode === 'paid' ? null : v.fee_percent_override,
    })
    .select('id')
    .single()
  if (insertError || !tenant) {
    if (insertError?.code === '23505') return { ok: false, errors: { slug: SLUG_TAKEN_MESSAGE } }
    return { ok: false, errors: {}, error: `Failed to create school: ${insertError?.message ?? 'unknown error'}` }
  }
  const tenantId: string = tenant.id

  let owner: Extract<CreateSchoolOnBehalfResult, { ok: true }>['owner']
  let selfOwned = false
  try {
    // Same rows create_school / the legacy onboarding action wrote, so the
    // school is as usable as one made through the self-serve flow.
    const settings: Array<{ tenant_id: string; setting_key: string; setting_value: { value: string } }> = [
      { tenant_id: tenantId, setting_key: 'site_name', setting_value: { value: name } },
    ]
    if (currency) settings.push({ tenant_id: tenantId, setting_key: 'currency', setting_value: { value: currency } })
    const { error: settingsError } = await admin
      .from('tenant_settings')
      .upsert(settings, { onConflict: 'tenant_id,setting_key' })
    if (settingsError) throw new Error(`Failed to write school settings: ${settingsError.message}`)

    if (v.plan) await syncTenantPlan(admin, tenantId, v.plan, nowIso)
    await reconcileAccessCutoffSafely(admin, tenantId)

    // Owner.
    const ownerId = isInternal ? superAdminId : await findAuthUserIdByEmail(admin, ownerEmail)
    if (ownerId) {
      const { error: memberError } = await admin
        .from('tenant_users')
        .insert({ tenant_id: tenantId, user_id: ownerId, role: 'admin', status: 'active' })
      if (memberError) throw new Error(`Failed to add the owner as admin: ${memberError.message}`)
      selfOwned = ownerId === superAdminId
      let email = ownerEmail
      if (isInternal) {
        const { data: me } = await admin.auth.admin.getUserById(superAdminId)
        email = me?.user?.email?.toLowerCase() ?? ''
      }
      owner = { kind: selfOwned ? 'self' : 'member_added', email }
    } else {
      const invite = await issueInvitation({
        admin,
        tenantId,
        email: ownerEmail,
        role: 'admin',
        invitedBy: superAdminId,
        sendEmailInvite: true,
      })
      if (!invite.ok) throw new Error(invite.error ?? 'Failed to invite the owner')
      owner = { kind: 'invited', email: ownerEmail, emailSent: invite.emailSent, joinUrl: invite.joinUrl }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('createSchoolOnBehalf failed, rolling back tenant', tenantId, err)
    // Children (tenant_users, tenant_settings, revenue_splits, platform_subscriptions,
    // tenant_invitations, tenant_billing_mode_log) all cascade from tenants.
    const { error: rollbackError } = await admin.from('tenants').delete().eq('id', tenantId)
    if (rollbackError) {
      console.error('createSchoolOnBehalf: ROLLBACK FAILED, orphan tenant', tenantId, rollbackError)
      return {
        ok: false,
        errors: {},
        error: `${message} (rollback failed, orphan tenant ${tenantId}: ${rollbackError.message})`,
      }
    }
    return { ok: false, errors: {}, error: message }
  }

  // The owner is the super admin themself (internal school or their own email):
  // point their next JWT at it, as create_school does. Never done for a third
  // party, whose active school is theirs to choose. Convenience, not integrity,
  // so a failure is logged and does not undo the school.
  if (selfOwned) await setActiveTenant(admin, superAdminId, tenantId)

  let siteUrl: string
  try {
    siteUrl = await getTenantSiteUrl(slug)
  } catch (err) {
    console.error('createSchoolOnBehalf: could not build site url', err)
    siteUrl = ''
  }

  return { ok: true, tenantId, slug, siteUrl, owner }
}
