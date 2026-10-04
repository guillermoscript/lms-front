import { createClient as createBearerClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/supabase/tenant'

export interface ApiAuthContext {
    supabase: SupabaseClient
    user: User
    tenantId: string
}

/**
 * Resolve auth for API routes that serve both the web app and the mobile app.
 *
 * - Web requests carry sb-* session cookies (and a subdomain-derived
 *   x-tenant-id header set by proxy.ts) — handled exactly as before via
 *   the cookie-based server client.
 * - Mobile requests carry `Authorization: Bearer <supabase access_token>`
 *   and no cookies/subdomain — handled by building an RLS-scoped client
 *   from the token and resolving the tenant from the verified JWT claim.
 *
 * Returns null when the request is unauthenticated (routes respond 401).
 */
export async function getApiAuthContext(req: Request): Promise<ApiAuthContext | null> {
    const bearerToken = (req.headers.get('authorization') ?? '').match(/^Bearer\s+(.+)$/i)?.[1]
    const cookieStore = await cookies()
    const hasSessionCookies = cookieStore.getAll().some((c) => c.name.startsWith('sb-'))

    // Cookie path takes precedence — the web never sends a Bearer header to
    // these routes, and a browser session must keep working unchanged.
    if (!bearerToken || hasSessionCookies) {
        const supabase = await createClient()
        const tenantId = await getCurrentTenantId()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return null
        return { supabase, user, tenantId }
    }

    return getBearerContext(bearerToken)
}

/**
 * Resolve only WHO is calling, over cookie or `Authorization: Bearer` auth —
 * no tenant. For routes the web also calls cookie-authenticated (e.g.
 * `/api/account/delete`) that must not depend on the caller's school. Routes
 * only the app calls use `getBearerUser` instead (#859). Returns null when
 * unauthenticated (routes respond 401).
 */
export async function getApiUser(req: Request): Promise<User | null> {
    const bearerToken = (req.headers.get('authorization') ?? '').match(/^Bearer\s+(.+)$/i)?.[1]
    const cookieStore = await cookies()
    const hasSessionCookies = cookieStore.getAll().some((c) => c.name.startsWith('sb-'))

    if (!bearerToken || hasSessionCookies) {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        return user ?? null
    }

    return verifyBearerToken(bearerToken)
}

/**
 * Resolve WHO is calling from an `Authorization: Bearer` token ONLY — session
 * cookies are ignored. For routes only the native app calls and that spend
 * something on the caller's behalf (`/api/tenant/switch` joins a school, which
 * costs a seat; #859). A browser attaches the `sb-*` cookie to a cross-site
 * `text/plain` POST — and sibling tenant subdomains count as same-site, so
 * `SameSite=Lax` does not stop another school's page — but it cannot attach an
 * `Authorization` header cross-origin without a CORS preflight this app never
 * grants. Returns null when there is no valid token (routes respond 401).
 */
export async function getBearerUser(req: Request): Promise<User | null> {
    const bearerToken = (req.headers.get('authorization') ?? '').match(/^Bearer\s+(.+)$/i)?.[1]
    if (!bearerToken) return null
    return verifyBearerToken(bearerToken)
}

async function verifyBearerToken(token: string): Promise<User | null> {
    const authClient = createBearerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } }
    )
    // Server-side verification of signature and expiry.
    const { data, error } = await authClient.auth.getUser(token)
    return error || !data?.user ? null : data.user
}

async function getBearerContext(token: string): Promise<ApiAuthContext | null> {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY!

    const authClient = createBearerClient(url, anonKey, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false },
    })

    // Server-side verification — the claims below are only trusted because
    // this call validated the token's signature and expiry.
    const { data, error } = await authClient.auth.getUser(token)
    if (error || !data?.user) return null
    const user = data.user

    // Resolve tenant from the verified JWT claim, falling back to the user's
    // single active membership. If neither yields a tenant, the request is
    // ambiguous/unauthenticated for tenant-scoped routes — return null (→ 401).
    const claimTenantId = decodeJwtPayload(token)?.tenant_id
    const tenantId =
        (typeof claimTenantId === 'string' && claimTenantId) ||
        (await resolveTenantFromMembership(authClient, user.id))

    if (!tenantId) return null

    // Forward x-tenant-id like the web client does, so get_tenant_id()'s
    // header fallback stays consistent for tokens without a tenant_id claim.
    const supabase = createBearerClient(url, anonKey, {
        global: {
            headers: {
                Authorization: `Bearer ${token}`,
                'x-tenant-id': tenantId,
            },
        },
        auth: { persistSession: false, autoRefreshToken: false },
    })

    return { supabase, user, tenantId }
}

/**
 * Tokens issued before a user's app_metadata.tenant_id was set carry no
 * tenant_id claim. Fall back to the user's single active membership —
 * tenant_users is the authoritative source. Ambiguous (0 or 2+) → null.
 */
async function resolveTenantFromMembership(
    supabase: SupabaseClient,
    userId: string
): Promise<string | null> {
    const { data } = await supabase
        .from('tenant_users')
        .select('tenant_id')
        .eq('user_id', userId)
        .eq('status', 'active')
        .limit(2)
    if (data?.length === 1) return data[0].tenant_id
    return null
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
    try {
        return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'))
    } catch {
        return null
    }
}
