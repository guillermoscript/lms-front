import type { SupabaseClient } from '@supabase/supabase-js'
import { maskSecret } from './signing'

/** Endpoint as the UI sees it: the secret is never included, only a mask. */
export interface WebhookEndpointView {
  id: string
  name: string
  url: string
  events: string[]
  isActive: boolean
  disabledReason: string | null
  consecutiveFailures: number
  secretMask: string
  createdAt: string
}

export interface WebhookDeliveryView {
  id: string
  endpointId: string
  endpointName: string
  eventType: string
  tenantId: string | null
  status: 'pending' | 'success' | 'failed'
  attempts: number
  lastStatusCode: number | null
  lastError: string | null
  createdAt: string
  deliveredAt: string | null
}

type Scoped<T> = T & { is: (c: string, v: null) => T; eq: (c: string, v: string) => T }

/** tenantId null = platform-wide endpoints. */
export function scopeFilter<T>(query: T, tenantId: string | null): T {
  const q = query as Scoped<T>
  return tenantId === null ? q.is('tenant_id', null) : q.eq('tenant_id', tenantId)
}

export async function listEndpoints(admin: SupabaseClient, tenantId: string | null): Promise<WebhookEndpointView[]> {
  const { data, error } = await scopeFilter(
    admin
      .from('outbound_webhook_endpoints')
      .select('id, name, url, events, is_active, disabled_reason, consecutive_failures, secret, created_at')
      .order('created_at', { ascending: false }),
    tenantId
  )
  if (error) throw new Error(`list endpoints failed: ${error.code ?? 'unknown'}`)
  return (data ?? []).map((e) => ({
    id: e.id,
    name: e.name,
    url: e.url,
    events: e.events ?? [],
    isActive: e.is_active,
    disabledReason: e.disabled_reason,
    consecutiveFailures: e.consecutive_failures,
    secretMask: maskSecret(e.secret),
    createdAt: e.created_at,
  }))
}

export async function listRecentDeliveries(
  admin: SupabaseClient,
  tenantId: string | null,
  endpoints: WebhookEndpointView[],
  limit = 50
): Promise<WebhookDeliveryView[]> {
  if (endpoints.length === 0) return []
  const names = new Map(endpoints.map((e) => [e.id, e.name]))
  const { data, error } = await admin
    .from('outbound_webhook_deliveries')
    .select('id, endpoint_id, tenant_id, event_type, status, attempts, last_status_code, last_error, created_at, delivered_at')
    .in('endpoint_id', [...names.keys()])
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`list deliveries failed: ${error.code ?? 'unknown'}`)
  return (data ?? []).map((d) => ({
    id: d.id,
    endpointId: d.endpoint_id,
    endpointName: names.get(d.endpoint_id) ?? '',
    eventType: d.event_type,
    tenantId: d.tenant_id,
    status: d.status,
    attempts: d.attempts,
    lastStatusCode: d.last_status_code,
    lastError: d.last_error,
    createdAt: d.created_at,
    deliveredAt: d.delivered_at,
  }))
}
