'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getUserRole } from '@/lib/supabase/get-user-role'
import { getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { encryptCredential, getPaymentCredentialsKey } from '@/lib/payments/credentials'
import { evaluateConnectedAccountReadiness } from '@/lib/payments/tenant-payment-readiness'
import { ANALYTICS_EVENTS } from '@/lib/analytics/events'
import { track, safeAnalytics } from '@/lib/analytics/server'
import {
  evaluateSchoolActivation,
  isFirstConnectedProvider,
} from '@/lib/analytics/activation'
import { revalidatePath } from 'next/cache'
import { isPlanFeatureError, planFeatureErrorMessage, requirePlanFeature } from '@/lib/plans/server'

/**
 * A `tenant_settings.setting_value` JSONB payload. Every setting is stored as
 * one of two shapes — a boolean flag or a scalar — which is why readers
 * throughout the app index it as `.value?.enabled` or `.value?.value`.
 */
export type SettingValue = {
  enabled?: boolean
  value?: string | number | null
  message?: string
}

/** One setting as `getAllSettingsByCategory()` hands it to a settings form. */
export type SettingEntry = {
  value: SettingValue
  description: string | null
}

/**
 * `settingKey → entry`, the shape each of the four settings forms receives.
 * A type alias rather than an interface so it keeps an implicit index
 * signature and stays assignable to the looser props of the older forms.
 */
export type SettingsGroup = Record<string, SettingEntry | undefined>

/** A `tenant_settings` row as these actions select it. */
type SettingRow = { setting_key: string; setting_value: SettingValue }

interface SettingsResponse {
  success: boolean
  data?: Record<string, SettingValue>
  error?: string
}

/**
 * `getAllSettingsByCategory()` returns a different shape from the flat
 * accessors — `category → settingKey → entry` — so it gets its own response
 * type rather than a union that every caller would have to narrow.
 */
interface CategorySettingsResponse {
  success: boolean
  data?: Record<string, SettingsGroup>
  error?: string
}

/**
 * The wallet accessors live in this module for historical reasons but return a
 * `tenant_payment_wallets` row, not a setting — they were sharing
 * `SettingsResponse` and quietly typing a wallet address as a setting value.
 */
interface WalletResponse {
  success: boolean
  data?: { wallet_address: string | null }
  error?: string
}

/**
 * Get all tenant settings or settings filtered by key prefix
 */
export async function getSettings(category?: string): Promise<SettingsResponse> {
  try {
    const role = await getUserRole()
    if (role !== 'admin') {
      return { success: false, error: 'Unauthorized' }
    }

    const tenantId = await getCurrentTenantId()
    const supabase = createAdminClient()

    let query = supabase
      .from('tenant_settings')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('setting_key')

    if (category) {
      // Filter by category prefix (e.g. 'smtp_' for email settings)
      const categoryPrefixes: Record<string, string[]> = {
        general: ['site_name', 'site_description', 'contact_email', 'support_email', 'timezone', 'maintenance_mode'],
        email: ['smtp_', 'email_'],
        payment: ['stripe_', 'paypal_', 'lemonsqueezy_', 'solana_', 'binance_', 'currency', 'tax_rate', 'invoice_prefix', 'require_payment_approval', 'manual_payment_instructions'],
        enrollment: ['auto_enrollment', 'require_enrollment_approval', 'max_enrollments_per_user', 'allow_self_enrollment', 'enrollment_expiration_days', 'course_capacity_enabled'],
      }
      const keys = categoryPrefixes[category]
      if (keys) {
        query = query.or(keys.map(k => k.endsWith('_') ? `setting_key.like.${k}%` : `setting_key.eq.${k}`).join(','))
      }
    }

    const { data, error } = await query

    if (error) throw error

    const settings = (data || []).reduce((acc: Record<string, SettingValue>, s: SettingRow) => {
      acc[s.setting_key] = s.setting_value
      return acc
    }, {})

    return { success: true, data: settings }
  } catch (error) {
    console.error('Error fetching settings:', error)
    return { success: false, error: 'Failed to fetch settings' }
  }
}

/**
 * Get a single setting by key
 */
export async function getSetting(key: string): Promise<SettingsResponse> {
  try {
    const role = await getUserRole()
    if (role !== 'admin') {
      return { success: false, error: 'Unauthorized' }
    }

    const tenantId = await getCurrentTenantId()
    const supabase = createAdminClient()

    const { data, error } = await supabase
      .from('tenant_settings')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('setting_key', key)
      .single()

    if (error) throw error

    return { success: true, data: data.setting_value }
  } catch (error) {
    console.error('Error fetching setting:', error)
    return { success: false, error: 'Failed to fetch setting' }
  }
}

/**
 * Settings that only a plan with `custom_branding` may write (#662). Logo,
 * favicon and site name are identity, not branding, and stay open to every
 * plan — see PRODUCT.md "Plan tiers".
 */
const CUSTOM_BRANDING_KEYS = new Set(['primary_color', 'secondary_color', 'theme_preset'])

async function refuseBrandingBelowPlan(
  tenantId: string,
  keys: string[]
): Promise<SettingsResponse | null> {
  if (!keys.some((k) => CUSTOM_BRANDING_KEYS.has(k))) return null
  try {
    await requirePlanFeature(tenantId, 'custom_branding')
    return null
  } catch (err) {
    if (isPlanFeatureError(err)) return { success: false, error: planFeatureErrorMessage(err) }
    throw err
  }
}

/**
 * Update a setting by key (upsert into tenant_settings)
 */
export async function updateSetting(
  key: string,
  value: SettingValue
): Promise<SettingsResponse> {
  try {
    const role = await getUserRole()
    if (role !== 'admin') {
      return { success: false, error: 'Unauthorized' }
    }

    if (typeof value !== 'object' || value === null) {
      return { success: false, error: 'Setting value must be an object' }
    }

    const tenantId = await getCurrentTenantId()
    const brandingRefusal = await refuseBrandingBelowPlan(tenantId, [key])
    if (brandingRefusal) return brandingRefusal
    const supabase = createAdminClient()

    const { data, error } = await supabase
      .from('tenant_settings')
      .upsert(
        { tenant_id: tenantId, setting_key: key, setting_value: value },
        { onConflict: 'tenant_id,setting_key' }
      )
      .select()
      .single()

    if (error) throw error

    revalidatePath('/dashboard/admin/settings')
    revalidatePath('/dashboard/admin')

    return { success: true, data: data.setting_value }
  } catch (error) {
    console.error('Error updating setting:', error)
    return { success: false, error: 'Failed to update setting' }
  }
}

/**
 * Update multiple settings at once (bulk upsert)
 */
export async function updateSettings(
  settings: Record<string, SettingValue>
): Promise<SettingsResponse> {
  try {
    const role = await getUserRole()
    if (role !== 'admin') {
      return { success: false, error: 'Unauthorized' }
    }

    const tenantId = await getCurrentTenantId()
    const brandingRefusal = await refuseBrandingBelowPlan(tenantId, Object.keys(settings))
    if (brandingRefusal) return brandingRefusal
    const supabase = createAdminClient()

    const rows = Object.entries(settings).map(([key, value]) => ({
      tenant_id: tenantId,
      setting_key: key,
      setting_value: value,
    }))

    const { error } = await supabase
      .from('tenant_settings')
      .upsert(rows, { onConflict: 'tenant_id,setting_key' })

    if (error) throw error

    revalidatePath('/dashboard/admin/settings')
    revalidatePath('/dashboard/admin')

    return { success: true, data: settings }
  } catch (error) {
    console.error('Error updating settings:', error)
    return { success: false, error: 'Failed to update settings' }
  }
}

/**
 * Reset a setting to its default value
 */
export async function resetSetting(key: string): Promise<SettingsResponse> {
  try {
    const role = await getUserRole()
    if (role !== 'admin') {
      return { success: false, error: 'Unauthorized' }
    }

    const defaults: Record<string, SettingValue> = {
      site_name: { value: 'My School' },
      site_description: { value: 'An online learning platform' },
      contact_email: { value: 'contact@example.com' },
      support_email: { value: 'support@example.com' },
      timezone: { value: 'America/New_York' },
      maintenance_mode: { enabled: false, message: '' },
      smtp_host: { value: '' },
      smtp_port: { value: 587 },
      smtp_username: { value: '' },
      smtp_password: { value: '' },
      smtp_from_email: { value: 'noreply@example.com' },
      smtp_from_name: { value: 'My School' },
      email_notifications: { enabled: true },
      stripe_enabled: { enabled: true },
      paypal_enabled: { enabled: false },
      lemonsqueezy_enabled: { enabled: false },
      solana_enabled: { enabled: false },
      solana_accept_sol: { enabled: false },
      currency: { value: 'USD' },
      tax_rate: { value: 0 },
      invoice_prefix: { value: 'INV' },
      require_payment_approval: { enabled: false },
      auto_enrollment: { enabled: false },
      require_enrollment_approval: { enabled: false },
      max_enrollments_per_user: { value: 0 },
      allow_self_enrollment: { enabled: true },
      enrollment_expiration_days: { value: 365 },
      course_capacity_enabled: { enabled: false },
      logo_url: { value: '' },
      primary_color: { value: '#2563eb' },
      secondary_color: { value: '#7c3aed' },
      favicon_url: { value: '' },
    }

    const defaultValue = defaults[key]
    if (!defaultValue) {
      return { success: false, error: 'Unknown setting key' }
    }

    return updateSetting(key, defaultValue)
  } catch (error) {
    console.error('Error resetting setting:', error)
    return { success: false, error: 'Failed to reset setting' }
  }
}

/**
 * Get this tenant's configured Solana receiving wallet (if any).
 *
 * One wallet backs both the one-time `solana` provider and the auto-pull
 * `solana_subs` provider, so we read the `solana` row as the source of truth.
 */
export async function getSolanaWallet(): Promise<WalletResponse> {
  try {
    const role = await getUserRole()
    if (role !== 'admin') {
      return { success: false, error: 'Unauthorized' }
    }

    const tenantId = await getCurrentTenantId()
    const supabase = createAdminClient()

    const { data, error } = await supabase
      .from('tenant_payment_wallets')
      .select('wallet_address')
      .eq('tenant_id', tenantId)
      .eq('provider', 'solana')
      .maybeSingle()

    if (error) throw error

    return { success: true, data: { wallet_address: data?.wallet_address || '' } }
  } catch (error) {
    console.error('Error fetching Solana wallet:', error)
    return { success: false, error: 'Failed to fetch Solana wallet' }
  }
}

/**
 * Upsert this tenant's Solana receiving wallet.
 *
 * Writes BOTH the `solana` and `solana_subs` rows from one input so a school
 * configures its wallet once — the one-time (/tx, /verify) and subscription
 * (/subscribe-tx, cron pull) routes filter by their exact provider string.
 * Uses the service-role client (bypasses RLS), so admin role + tenant scope are
 * validated above and the rows are written with this tenant's id only.
 */
export async function setSolanaWallet(walletAddress: string): Promise<WalletResponse> {
  try {
    const role = await getUserRole()
    if (role !== 'admin') {
      return { success: false, error: 'Unauthorized' }
    }

    const address = (walletAddress || '').trim()
    // Solana addresses are base58, 32–44 chars (no 0, O, I, l).
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) {
      return { success: false, error: 'Enter a valid Solana wallet address (base58, 32–44 characters).' }
    }

    const tenantId = await getCurrentTenantId()
    const supabase = createAdminClient()

    // Was Solana already configured? Read BEFORE the upsert: re-saving the same
    // wallet, or correcting a typo in it, is not a new connection, and
    // `payment_provider_connected` counted per save would make the activation
    // funnel's denominator meaningless.
    //
    // Guarded: this read exists only to decide whether to emit, and it runs
    // BEFORE the upsert — unguarded, a transient failure here would abort the
    // wallet save itself. `null` means the read failed; unknowable is not
    // "new", for the same reason `isFirstConnectedProvider` returns false.
    const existingWalletRead = await Promise.resolve(
      supabase
        .from('tenant_payment_wallets')
        .select('wallet_address')
        .eq('tenant_id', tenantId)
        .eq('provider', 'solana')
        .maybeSingle()
    ).catch(() => null)
    const isNewConnection = !!existingWalletRead && !existingWalletRead.data?.wallet_address
    const isFirstProvider = isNewConnection
      ? await isFirstConnectedProvider(tenantId, 'solana', supabase)
      : false

    const rows = ['solana', 'solana_subs'].map(provider => ({
      tenant_id: tenantId,
      provider,
      wallet_address: address,
      updated_at: new Date().toISOString(),
    }))

    const { error } = await supabase
      .from('tenant_payment_wallets')
      .upsert(rows, { onConflict: 'tenant_id,provider' })

    if (error) throw error

    // Wrapped: the wallet is already saved, and `getCurrentUserId()` is a real
    // await — the enclosing catch would otherwise report "Failed to save Solana
    // wallet" for a save that succeeded.
    if (isNewConnection) {
      await safeAnalytics(async () => {
        const userId = await getCurrentUserId()
        await track(
          ANALYTICS_EVENTS.PAYMENT_PROVIDER_CONNECTED,
          { provider: 'solana', is_first_provider: isFirstProvider },
          { userId, tenantId, role }
        )
        // Connecting a rail is the other half of the activation condition.
        await evaluateSchoolActivation({ tenantId, userId, role })
      }, 'payment_provider_connected (solana)')
    }

    revalidatePath('/dashboard/admin/settings')

    return { success: true, data: { wallet_address: address } }
  } catch (error) {
    console.error('Error saving Solana wallet:', error)
    return { success: false, error: 'Failed to save Solana wallet' }
  }
}

/**
 * Upsert this tenant's Binance Pay (personal account) credentials (issue #482).
 *
 * `wallet_address` holds the school's Binance Pay ID; the read-only API key and
 * secret are encrypted app-side (AES-256-GCM) before landing in the
 * `credentials` jsonb column, so a DB dump or the RLS-scoped settings UI never
 * sees plaintext. Uses the service-role client (bypasses RLS), so admin role +
 * tenant scope are validated here and the row is written with this tenant's id.
 *
 * The key/secret may be omitted on a later save (e.g. updating only the Pay ID)
 * — existing encrypted credentials are preserved in that case.
 */
export async function setBinancePersonalCredentials(
  payId: string,
  apiKey: string,
  apiSecret: string
): Promise<WalletResponse> {
  try {
    const role = await getUserRole()
    if (role !== 'admin') {
      return { success: false, error: 'Unauthorized' }
    }

    const id = (payId || '').trim()
    if (!id) {
      return { success: false, error: 'Enter your Binance Pay ID.' }
    }

    const key = (apiKey || '').trim()
    const secret = (apiSecret || '').trim()

    const tenantId = await getCurrentTenantId()
    const supabase = createAdminClient()

    // Read any existing row so we can (a) tell whether credentials already exist
    // and (b) preserve them when the admin updates only the Pay ID.
    const { data: existing } = await supabase
      .from('tenant_payment_wallets')
      .select('wallet_address, credentials')
      .eq('tenant_id', tenantId)
      .eq('provider', 'binance_personal')
      .maybeSingle()

    const existingCredentials = (existing?.credentials || {}) as {
      api_key?: string
      api_secret?: string
    }
    const hasExistingCredentials = Boolean(
      existingCredentials.api_key && existingCredentials.api_secret
    )

    // Require key+secret on first save; allow Pay-ID-only updates afterwards.
    if (!hasExistingCredentials && (!key || !secret)) {
      return { success: false, error: 'Enter your Binance API key and secret.' }
    }

    // Only the save that first makes the rail usable counts as a connection —
    // Pay ID *and* credentials. Later Pay-ID-only edits go through this same
    // action and must not re-fire, so they don't pay for the query either.
    const wasUsable = Boolean(existing?.wallet_address && hasExistingCredentials)
    const isFirstProviderBeforeSave = wasUsable
      ? false
      : await isFirstConnectedProvider(tenantId, 'binance_personal', supabase)

    let credentials = existingCredentials
    if (key || secret) {
      if (!key || !secret) {
        return { success: false, error: 'Enter both the API key and the API secret.' }
      }
      // Never store plaintext — fail closed if the encryption key is unset.
      let encryptionKey: string
      try {
        encryptionKey = getPaymentCredentialsKey()
      } catch {
        return { success: false, error: 'PAYMENT_CREDENTIALS_ENCRYPTION_KEY is not configured' }
      }
      credentials = {
        api_key: encryptCredential(key, encryptionKey),
        api_secret: encryptCredential(secret, encryptionKey),
      }
    }

    const { error } = await supabase.from('tenant_payment_wallets').upsert(
      {
        tenant_id: tenantId,
        provider: 'binance_personal',
        wallet_address: id,
        credentials,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'tenant_id,provider' }
    )

    if (error) throw error

    // Wrapped for the same reason as the Solana branch: the credentials are
    // already saved, so a failing `getCurrentUserId()` must not surface as
    // "Failed to save Binance settings".
    if (!wasUsable) {
      await safeAnalytics(async () => {
        const userId = await getCurrentUserId()
        await track(
          ANALYTICS_EVENTS.PAYMENT_PROVIDER_CONNECTED,
          {
            provider: 'binance_personal',
            is_first_provider: isFirstProviderBeforeSave,
          },
          { userId, tenantId, role }
        )
        await evaluateSchoolActivation({ tenantId, userId, role })
      }, 'payment_provider_connected (binance_personal)')
    }

    revalidatePath('/dashboard/admin/settings')

    return { success: true, data: { wallet_address: id } }
  } catch (error) {
    console.error('Error saving Binance personal credentials:', error)
    return { success: false, error: 'Failed to save Binance Pay credentials' }
  }
}

/**
 * Get this tenant's Binance Pay (personal) status for the settings UI.
 *
 * Returns only the Pay ID and whether credentials are stored — the encrypted
 * API key/secret are NEVER returned or decrypted here.
 */
export async function getBinancePersonalStatus(): Promise<{
  success: boolean
  payId: string | null
  hasCredentials: boolean
  error?: string
}> {
  try {
    const role = await getUserRole()
    if (role !== 'admin') {
      return { success: false, payId: null, hasCredentials: false, error: 'Unauthorized' }
    }

    const tenantId = await getCurrentTenantId()
    const supabase = createAdminClient()

    const { data, error } = await supabase
      .from('tenant_payment_wallets')
      .select('wallet_address, credentials')
      .eq('tenant_id', tenantId)
      .eq('provider', 'binance_personal')
      .maybeSingle()

    if (error) throw error

    const credentials = (data?.credentials || {}) as { api_key?: string; api_secret?: string }
    return {
      success: true,
      payId: data?.wallet_address || null,
      hasCredentials: Boolean(credentials.api_key && credentials.api_secret),
    }
  } catch (error) {
    console.error('Error fetching Binance personal status:', error)
    return { success: false, payId: null, hasCredentials: false, error: 'Failed to fetch status' }
  }
}

/**
 * Resolve which payment providers an admin has enabled for this tenant.
 *
 * The `*_enabled` toggles in `tenant_settings` are the single source of truth
 * for WANTING a provider on, but a flag alone is not enough to offer a rail —
 * a flag flipped on before the rail is actually configured (Stripe Connect
 * abandoned mid-onboarding, no Solana receiving wallet saved) used to reach
 * checkout and then fail at payment time, with the student staring at a
 * generic error and the school never told why. Stripe and Solana are gated on
 * their real readiness below, same as `binance_personal` already was.
 * `manual` (offline) is always available. The one Solana toggle enables BOTH
 * the one-time `solana` and the auto-pull `solana_subs` providers, since they
 * share one wallet.
 *
 * Defaults match the seed defaults: Stripe on, everything else off.
 */
export async function getEnabledPaymentProviders(): Promise<{ success: boolean; data: string[]; error?: string }> {
  try {
    const role = await getUserRole()
    if (role !== 'admin') {
      return { success: false, data: ['manual'], error: 'Unauthorized' }
    }

    const tenantId = await getCurrentTenantId()
    const supabase = createAdminClient()

    const { data, error } = await supabase
      .from('tenant_settings')
      .select('setting_key, setting_value')
      .eq('tenant_id', tenantId)
      .in('setting_key', ['stripe_enabled', 'paypal_enabled', 'lemonsqueezy_enabled', 'solana_enabled', 'binance_enabled', 'binance_personal_enabled'])

    if (error) throw error

    const flags = (data || []).reduce(
      (acc: Record<string, boolean>, s: { setting_key: string; setting_value: { enabled?: boolean } | null }) => {
        acc[s.setting_key] = s.setting_value?.enabled === true
        return acc
      },
      {} as Record<string, boolean>
    )

    // No row yet → fall back to the seed defaults (Stripe on, rest off).
    const isOn = (key: string, fallback: boolean) =>
      key in flags ? flags[key] : fallback

    const stripeOn = isOn('stripe_enabled', true)
    const solanaOn = isOn('solana_enabled', false)
    const binancePersonalOn = isOn('binance_personal_enabled', false)

    // Stripe: a flag alone used to offer a rail that fails at payment time — an
    // admin could flip `stripe_enabled` without ever finishing Connect
    // onboarding, and the card form would appear at checkout only for Stripe to
    // reject the PaymentIntent (`charges_enabled: false`). This reads the same
    // persisted columns `isReadyToAcceptPayments()` reads for checkout/publish
    // (`evaluateConnectedAccountReadiness`) rather than calling Stripe's API on
    // this hot path — `syncConnectAccountStatus()` and the `account.updated`
    // webhook keep those columns fresh.
    let stripeReady = false
    if (stripeOn) {
      const { data: tenant } = await supabase
        .from('tenants')
        .select('stripe_account_id, stripe_charges_enabled')
        .eq('id', tenantId)
        .single()
      stripeReady = evaluateConnectedAccountReadiness(tenant).ready
    }

    // Solana and binance_personal both gate on a `tenant_payment_wallets` row —
    // fetch both providers in ONE query instead of one round trip per provider.
    const walletProviders = [solanaOn && 'solana', binancePersonalOn && 'binance_personal'].filter(
      (p): p is 'solana' | 'binance_personal' => Boolean(p)
    )
    const walletsByProvider = new Map<string, { wallet_address: string | null; credentials: unknown }>()
    if (walletProviders.length > 0) {
      const { data: wallets } = await supabase
        .from('tenant_payment_wallets')
        .select('provider, wallet_address, credentials')
        .eq('tenant_id', tenantId)
        .in('provider', walletProviders)
      for (const wallet of wallets || []) {
        walletsByProvider.set(wallet.provider, wallet)
      }
    }

    const providers: string[] = ['manual']
    if (stripeOn && stripeReady) providers.push('stripe')
    if (isOn('paypal_enabled', false)) providers.push('paypal')
    if (isOn('lemonsqueezy_enabled', false)) providers.push('lemonsqueezy')

    // Solana: a flag alone used to offer a rail with no receiving wallet — the
    // one-time and subscription checkout routes have nowhere to point a
    // payment without a `tenant_payment_wallets` row.
    if (solanaOn) {
      const wallet = walletsByProvider.get('solana')
      if (wallet?.wallet_address) {
        providers.push('solana', 'solana_subs')
      }
    }

    if (isOn('binance_enabled', false)) providers.push('binance')

    // binance_personal is only usable once the school has actually configured
    // its Pay ID + API credentials — no dead providers in the checkout forms.
    if (binancePersonalOn) {
      const wallet = walletsByProvider.get('binance_personal')
      // Both halves of the pair, not just the key: confirming a transfer signs
      // the SAPI query with the SECRET (`signSapiQuery`), so a row holding only
      // an api_key offered a rail that could take a payment and then never
      // confirm it. `getBinancePersonalStatus()` — which drives the settings
      // screen's readiness pill — has always required both; this is the same
      // check, so the screen and checkout can no longer disagree.
      const credentials = (wallet?.credentials || {}) as {
        api_key?: string
        api_secret?: string
      }
      if (wallet?.wallet_address && credentials.api_key && credentials.api_secret) {
        providers.push('binance_personal')
      }
    }

    return { success: true, data: providers }
  } catch (error) {
    console.error('Error resolving enabled payment providers:', error)
    // Never block the form entirely — offline always works.
    return { success: false, data: ['manual'], error: 'Failed to resolve enabled providers' }
  }
}

/**
 * Which Solana settlement tokens the current tenant offers at checkout.
 *
 * USDC is available whenever the platform has a USDC mint configured
 * (SOLANA_USDC_MINT) — it is a 1:1 USD stablecoin, so it always reflects the
 * USD price. Native SOL is OPT-IN per school via the `solana_accept_sol`
 * toggle (default off), because SOL is volatile: it is converted from the USD
 * price at the live rate at checkout. No role gate — students call this at
 * checkout. Returns only booleans.
 */
export async function getSolanaSettlementOptions(): Promise<{ usdc: boolean; sol: boolean }> {
  try {
    const tenantId = await getCurrentTenantId()
    const supabase = createAdminClient()
    const { data } = await supabase
      .from('tenant_settings')
      .select('setting_value')
      .eq('tenant_id', tenantId)
      .eq('setting_key', 'solana_accept_sol')
      .maybeSingle()
    const sol = (data?.setting_value as { enabled?: boolean } | null)?.enabled === true
    const usdc = !!process.env.SOLANA_USDC_MINT
    return { usdc, sol }
  } catch (error) {
    console.error('Error resolving Solana settlement options:', error)
    return { usdc: !!process.env.SOLANA_USDC_MINT, sol: false }
  }
}

/**
 * Get this tenant's free-text manual/offline payment instructions (if any).
 *
 * No role gate — students read this at checkout to learn how to pay before
 * submitting a request. Returns a plain string ('' when unset). The value is
 * stored under the `manual_payment_instructions` key as `{ value: string }`.
 */
export async function getManualPaymentInstructions(): Promise<string> {
  try {
    const tenantId = await getCurrentTenantId()
    const supabase = createAdminClient()
    const { data } = await supabase
      .from('tenant_settings')
      .select('setting_value')
      .eq('tenant_id', tenantId)
      .eq('setting_key', 'manual_payment_instructions')
      .maybeSingle()
    return (data?.setting_value as { value?: string } | null)?.value?.trim() || ''
  } catch (error) {
    console.error('Error resolving manual payment instructions:', error)
    return ''
  }
}

/**
 * Get all settings grouped by category (for the settings page)
 */
export async function getAllSettingsByCategory(): Promise<CategorySettingsResponse> {
  try {
    const role = await getUserRole()
    if (role !== 'admin') {
      return { success: false, error: 'Unauthorized' }
    }

    const tenantId = await getCurrentTenantId()
    const supabase = createAdminClient()

    const { data, error } = await supabase
      .from('tenant_settings')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('setting_key')

    if (error) throw error

    // Categorize by setting key prefix
    const categoryMap: Record<string, string> = {
      site_name: 'general', site_description: 'general', contact_email: 'general',
      support_email: 'general', timezone: 'general', maintenance_mode: 'general',
      logo_url: 'general', favicon_url: 'general', primary_color: 'general', secondary_color: 'general',
      smtp_host: 'email', smtp_port: 'email', smtp_username: 'email', smtp_password: 'email',
      smtp_from_email: 'email', smtp_from_name: 'email', email_notifications: 'email',
      stripe_enabled: 'payment', paypal_enabled: 'payment', binance_enabled: 'payment', binance_personal_enabled: 'payment',
      lemonsqueezy_enabled: 'payment', solana_enabled: 'payment', solana_accept_sol: 'payment', currency: 'payment',
      tax_rate: 'payment', invoice_prefix: 'payment', require_payment_approval: 'payment',
      manual_payment_instructions: 'payment',
      auto_enrollment: 'enrollment', require_enrollment_approval: 'enrollment',
      max_enrollments_per_user: 'enrollment', allow_self_enrollment: 'enrollment',
      enrollment_expiration_days: 'enrollment', course_capacity_enabled: 'enrollment',
    }

    const grouped = (data || []).reduce((acc: Record<string, SettingsGroup>, s: SettingRow) => {
      const category = categoryMap[s.setting_key] || 'general'
      if (!acc[category]) acc[category] = {}
      acc[category][s.setting_key] = {
        value: s.setting_value,
        description: null,
      }
      return acc
    }, {})

    return { success: true, data: grouped }
  } catch (error) {
    console.error('Error fetching settings by category:', error)
    return { success: false, error: 'Failed to fetch settings' }
  }
}
