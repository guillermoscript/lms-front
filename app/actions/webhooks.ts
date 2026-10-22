'use server'

/**
 * Outbound webhook management for school admins (scope 'school') and platform
 * super-admins (scope 'platform'). One surface, two scopes: the CLIENT only says
 * which scope it wants; the tenant is always resolved server-side, and every
 * query filters by it. Writes use the service role (the tables are not
 * client-readable: they hold signing secrets), so the filter below is the
 * isolation boundary.
 *
 * Results are returned, never thrown (a thrown server-action error is masked in
 * production). Secrets are returned exactly once: on create and on rotate.
 */
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUserRole, isSuperAdmin } from '@/lib/supabase/get-user-role'
import { getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { parseEndpointInput, type WebhookField } from '@/lib/webhooks/input'
import { generateWebhookSecret } from '@/lib/webhooks/signing'
import { scopeFilter } from '@/lib/webhooks/endpoints'
import { sendTestDelivery, type EndpointRow } from '@/lib/webhooks/deliver'
import { assertSafeUrl } from '@/lib/webhooks/url-guard'
import type { WebhookScope } from '@/lib/webhooks/events'

export type WebhookActionError =
  | 'forbidden' | 'invalid' | 'insecure_url' | 'blocked_host' | 'not_found' | 'limit_reached' | 'internal'

export type WebhookActionResult<T = undefined> =
  | { ok: true; value?: T }
  | { ok: false; error: WebhookActionError; fields?: WebhookField[] }

interface Actor { tenantId: string | null; userId: string }

async function resolveActor(scope: WebhookScope): Promise<Actor | null> {
  const userId = await getCurrentUserId()
  if (!userId) return null
  if (scope === 'platform') {
    return (await isSuperAdmin()) ? { tenantId: null, userId } : null
  }
  if ((await getUserRole()) !== 'admin') return null
  try {
    return { tenantId: await getCurrentTenantId(), userId }
  } catch {
    return null
  }
}

function fail(error: WebhookActionError, fields?: WebhookField[]): WebhookActionResult<never> {
  return { ok: false, error, fields }
}

function revalidate(scope: WebhookScope) {
  revalidatePath(scope === 'platform' ? '/[locale]/platform/webhooks' : '/[locale]/dashboard/admin/settings/webhooks', 'page')
}

export async function createWebhookEndpointAction(
  scope: WebhookScope,
  raw: unknown
): Promise<WebhookActionResult<{ id: string; secret: string }>> {
  const actor = await resolveActor(scope)
  if (!actor) return fail('forbidden')
  const parsed = parseEndpointInput(scope, raw)
  if (!parsed.ok) return fail(parsed.reason === 'insecure_url' || parsed.reason === 'blocked_host' ? parsed.reason : 'invalid', parsed.fields)
  const safe = await assertSafeUrl(parsed.value.url)
  if (!safe.ok) return fail(safe.reason === 'invalid_url' ? 'invalid' : safe.reason, ['url'])

  const secret = generateWebhookSecret()
  const { data, error } = await createAdminClient()
    .from('outbound_webhook_endpoints')
    .insert({ ...parsed.value, tenant_id: actor.tenantId, secret, created_by: actor.userId })
    .select('id')
    .single()
  if (error || !data) {
    if (error?.code === '54000') return fail('limit_reached')
    console.error('[webhooks] create failed:', error?.code)
    return fail('internal')
  }
  revalidate(scope)
  return { ok: true, value: { id: data.id, secret } }
}

export async function updateWebhookEndpointAction(
  scope: WebhookScope,
  id: string,
  raw: unknown
): Promise<WebhookActionResult> {
  const actor = await resolveActor(scope)
  if (!actor) return fail('forbidden')
  const parsed = parseEndpointInput(scope, raw)
  if (!parsed.ok) return fail(parsed.reason === 'insecure_url' || parsed.reason === 'blocked_host' ? parsed.reason : 'invalid', parsed.fields)
  const safe = await assertSafeUrl(parsed.value.url)
  if (!safe.ok) return fail(safe.reason === 'invalid_url' ? 'invalid' : safe.reason, ['url'])

  const { data, error } = await scopeFilter(
    createAdminClient()
      .from('outbound_webhook_endpoints')
      .update({ ...parsed.value, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id'),
    actor.tenantId
  )
  if (error) {
    console.error('[webhooks] update failed:', error.code)
    return fail(error.code === '22P02' ? 'not_found' : 'internal')
  }
  if (!data || data.length === 0) return fail('not_found')
  revalidate(scope)
  return { ok: true }
}

export async function setWebhookEndpointActiveAction(
  scope: WebhookScope,
  id: string,
  active: boolean
): Promise<WebhookActionResult> {
  const actor = await resolveActor(scope)
  if (!actor) return fail('forbidden')
  const { data, error } = await scopeFilter(
    createAdminClient()
      .from('outbound_webhook_endpoints')
      .update({
        is_active: active,
        updated_at: new Date().toISOString(),
        // Re-enabling is a fresh start; disabling by hand clears the auto-disable reason.
        ...(active ? { consecutive_failures: 0, disabled_reason: null } : {}),
      })
      .eq('id', id)
      .select('id'),
    actor.tenantId
  )
  if (error) return fail(error.code === '22P02' ? 'not_found' : 'internal')
  if (!data || data.length === 0) return fail('not_found')
  revalidate(scope)
  return { ok: true }
}

export async function deleteWebhookEndpointAction(scope: WebhookScope, id: string): Promise<WebhookActionResult> {
  const actor = await resolveActor(scope)
  if (!actor) return fail('forbidden')
  const { data, error } = await scopeFilter(
    createAdminClient().from('outbound_webhook_endpoints').delete().eq('id', id).select('id'),
    actor.tenantId
  )
  if (error) return fail(error.code === '22P02' ? 'not_found' : 'internal')
  if (!data || data.length === 0) return fail('not_found')
  revalidate(scope)
  return { ok: true }
}

export async function rotateWebhookSecretAction(
  scope: WebhookScope,
  id: string
): Promise<WebhookActionResult<{ secret: string }>> {
  const actor = await resolveActor(scope)
  if (!actor) return fail('forbidden')
  const secret = generateWebhookSecret()
  const { data, error } = await scopeFilter(
    createAdminClient()
      .from('outbound_webhook_endpoints')
      .update({ secret, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id'),
    actor.tenantId
  )
  if (error) return fail(error.code === '22P02' ? 'not_found' : 'internal')
  if (!data || data.length === 0) return fail('not_found')
  revalidate(scope)
  return { ok: true, value: { secret } }
}

export async function testWebhookEndpointAction(
  scope: WebhookScope,
  id: string
): Promise<WebhookActionResult<{ delivered: boolean; statusCode: number | null; error: string | null }>> {
  const actor = await resolveActor(scope)
  if (!actor) return fail('forbidden')
  const admin = createAdminClient()
  const { data: endpoint, error } = await scopeFilter(
    admin
      .from('outbound_webhook_endpoints')
      .select('id, tenant_id, url, secret, is_active, consecutive_failures')
      .eq('id', id),
    actor.tenantId
  ).maybeSingle()
  if (error) return fail(error.code === '22P02' ? 'not_found' : 'internal')
  if (!endpoint) return fail('not_found')

  const outcome = await sendTestDelivery(admin, endpoint as EndpointRow)
  revalidate(scope)
  return { ok: true, value: { delivered: outcome.ok, statusCode: outcome.statusCode, error: outcome.error } }
}

/** Put a failed delivery back in the queue (fresh retry schedule). */
export async function retryWebhookDeliveryAction(scope: WebhookScope, deliveryId: string): Promise<WebhookActionResult> {
  const actor = await resolveActor(scope)
  if (!actor) return fail('forbidden')
  const admin = createAdminClient()

  const { data: delivery, error } = await admin
    .from('outbound_webhook_deliveries')
    .select('id, endpoint_id, status')
    .eq('id', deliveryId)
    .maybeSingle()
  if (error) return fail(error.code === '22P02' ? 'not_found' : 'internal')
  if (!delivery) return fail('not_found')

  // Ownership via the endpoint's scope, never the client's say-so.
  const { data: endpoint } = await scopeFilter(
    admin.from('outbound_webhook_endpoints').select('id, is_active').eq('id', delivery.endpoint_id),
    actor.tenantId
  ).maybeSingle()
  if (!endpoint) return fail('not_found')
  if (delivery.status === 'pending') return { ok: true }

  const { error: upErr } = await admin
    .from('outbound_webhook_deliveries')
    .update({ status: 'pending', attempts: 0, next_attempt_at: new Date().toISOString(), last_error: null })
    .eq('id', deliveryId)
  if (upErr) return fail('internal')
  revalidate(scope)
  return { ok: true }
}
