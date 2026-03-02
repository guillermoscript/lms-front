import { createClient } from '@/lib/supabase/server';
import { mcpLimiter } from '@/lib/rate-limit';
import { NextRequest, NextResponse } from 'next/server';

const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'http://127.0.0.1:3001';
const MCP_PROXY_SECRET = process.env.MCP_PROXY_SECRET;

/**
 * Catch-all MCP Proxy Route (Multi-Tenant Aware)
 *
 * This proxy sits between MCP clients and the internal MCP server.
 * It handles three access patterns:
 *
 * 1. **OAuth (Claude Desktop)** — /.well-known/*, /auth/*, /mcp
 *    Metadata served by proxy with per-tenant URLs.
 *    All other OAuth endpoints forwarded to MCP server.
 *
 * 2. **CLI API Tokens** — /cli
 *    Validates Bearer tokens via validate_mcp_api_token() RPC,
 *    then forwards to MCP server with user context headers.
 *
 * 3. **Session (Web UI)** — / (root, no subpath)
 *    Validates Supabase session, then forwards to MCP server.
 *
 * Multi-tenancy:
 * - OAuth metadata uses request Host header for per-tenant URLs
 * - MCP server reads X-Origin header for consent page redirects
 * - CLI/session handlers read x-tenant-id from proxy.ts
 */

// ─── Helpers ────────────────────────────────────────────────────────────────

function getOrigin(request: NextRequest): string {
  const proto = request.headers.get('x-forwarded-proto') || 'https';
  const host = request.headers.get('host') || 'localhost:3000';
  return `${proto}://${host}`;
}

function getSubpath(request: NextRequest): string {
  const path = new URL(request.url).pathname;
  return path.replace(/^\/api\/mcp/, '') || '/mcp';
}

// ─── OAuth Metadata (served directly by proxy, tenant-aware) ───────────────

function serveAuthorizationServerMetadata(request: NextRequest): NextResponse {
  const origin = getOrigin(request);
  const mcpBase = `${origin}/api/mcp`;

  return NextResponse.json({
    issuer: mcpBase,
    authorization_endpoint: `${mcpBase}/auth/authorize`,
    token_endpoint: `${mcpBase}/auth/token`,
    registration_endpoint: `${mcpBase}/auth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
    code_challenge_methods_supported: ['S256'],
    scopes_supported: ['mcp:tools'],
    revocation_endpoint: `${mcpBase}/auth/revoke`,
  }, {
    headers: {
      'cache-control': 'public, max-age=3600',
      'access-control-allow-origin': '*',
    },
  });
}

function serveProtectedResourceMetadata(request: NextRequest): NextResponse {
  const origin = getOrigin(request);
  const mcpBase = `${origin}/api/mcp`;

  return NextResponse.json({
    resource: mcpBase,
    authorization_servers: [mcpBase],
    scopes_supported: ['mcp:tools'],
    bearer_methods_supported: ['header'],
    resource_name: 'LMS MCP Server',
  }, {
    headers: {
      'cache-control': 'public, max-age=3600',
      'access-control-allow-origin': '*',
    },
  });
}

// ─── CLI Token Handler (/cli) ──────────────────────────────────────────────

async function handleCliRequest(request: NextRequest): Promise<Response> {
  try {
    // 1. Extract bearer token
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { jsonrpc: '2.0', error: { code: -32001, message: 'Unauthorized: Missing Authorization: Bearer <token> header' } },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);

    // 2. Validate token via RPC
    const supabase = await createClient();
    const { data: tokenData, error: tokenError } = await supabase
      .rpc('validate_mcp_api_token', { token_input: token });

    if (tokenError || !tokenData || tokenData.length === 0) {
      return NextResponse.json(
        { jsonrpc: '2.0', error: { code: -32001, message: 'Unauthorized: Invalid, expired, or revoked API token' } },
        { status: 401 }
      );
    }

    const user = tokenData[0];
    const userId = user.user_id;
    const userRole = user.user_role;
    const tokenId = user.token_id;

    // 3. Verify role
    if (userRole !== 'teacher' && userRole !== 'admin') {
      return NextResponse.json(
        { jsonrpc: '2.0', error: { code: -32002, message: `Forbidden: MCP requires teacher or admin role (current: ${userRole})` } },
        { status: 403 }
      );
    }

    // 4. Rate limit
    try {
      await mcpLimiter.check(100, userId);
    } catch {
      return NextResponse.json(
        { jsonrpc: '2.0', error: { code: -32003, message: 'Rate limit exceeded (100 req/min)' } },
        { status: 429 }
      );
    }

    // 5. Parse body
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { jsonrpc: '2.0', error: { code: -32700, message: 'Parse error: Invalid JSON' } },
        { status: 400 }
      );
    }

    if (!body.jsonrpc || !body.method || body.jsonrpc !== '2.0') {
      return NextResponse.json(
        { jsonrpc: '2.0', id: body.id || null, error: { code: -32600, message: 'Invalid Request: Must be JSON-RPC 2.0' } },
        { status: 400 }
      );
    }

    // 6. Track token usage (fire and forget)
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0] ||
                     request.headers.get('x-real-ip') || '127.0.0.1';
    Promise.resolve().then(async () => {
      try {
        await supabase.rpc('update_token_last_used', { token_id_input: tokenId, ip_input: clientIp });
      } catch { /* non-critical */ }
    });

    // 7. Forward to MCP server
    const tenantId = request.headers.get('x-tenant-id') || '00000000-0000-0000-0000-000000000001';
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      'X-User-ID': userId,
      'X-User-Role': userRole,
      'X-Tenant-ID': tenantId,
    };
    if (MCP_PROXY_SECRET) headers['X-MCP-Secret'] = MCP_PROXY_SECRET;

    const mcpResponse = await fetch(`${MCP_SERVER_URL}/mcp`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!mcpResponse.ok) {
      let errorDetails = 'Unknown error';
      try {
        const errorJson = await mcpResponse.json();
        errorDetails = errorJson.error?.message || errorJson.error || JSON.stringify(errorJson);
      } catch {
        errorDetails = await mcpResponse.text();
      }
      return NextResponse.json(
        { jsonrpc: '2.0', id: body.id || null, error: { code: -32004, message: 'MCP server error', data: errorDetails } },
        { status: 502 }
      );
    }

    const result = await mcpResponse.json();
    return NextResponse.json(result);
  } catch (error) {
    console.error('[MCP CLI Proxy] Error:', error);
    return NextResponse.json(
      { jsonrpc: '2.0', error: { code: -32603, message: 'Internal error', data: error instanceof Error ? error.message : String(error) } },
      { status: 500 }
    );
  }
}

// ─── Generic Proxy to MCP Server ───────────────────────────────────────────

async function proxyToMcp(request: NextRequest, subpath: string): Promise<Response> {
  const targetUrl = new URL(subpath, MCP_SERVER_URL);

  request.nextUrl.searchParams.forEach((value, key) => {
    targetUrl.searchParams.set(key, value);
  });

  const headers = new Headers();
  for (const name of ['content-type', 'content-length', 'accept', 'authorization', 'x-tenant-id', 'x-forwarded-for', 'x-real-ip']) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  // Pass origin info for multi-tenant consent redirects
  const origin = getOrigin(request);
  headers.set('x-forwarded-host', request.headers.get('host') || 'localhost:3000');
  headers.set('x-forwarded-proto', request.headers.get('x-forwarded-proto') || 'https');
  headers.set('x-origin', origin);

  if ((request.method === 'POST' || request.method === 'PUT') && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  try {
    let body: BodyInit | null = null;
    if (request.method !== 'GET' && request.method !== 'HEAD' && request.method !== 'DELETE') {
      const contentType = request.headers.get('content-type') || '';
      if (contentType.includes('application/json') || contentType.includes('application/x-www-form-urlencoded')) {
        body = await request.text();
      } else {
        body = await request.arrayBuffer();
      }
    }

    const response = await fetch(targetUrl.toString(), {
      method: request.method,
      headers,
      body,
      redirect: 'manual',
    });

    // Pass through redirects
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (location) {
        return NextResponse.redirect(location, response.status as 301 | 302 | 303 | 307 | 308);
      }
    }

    const responseHeaders = new Headers();
    for (const name of ['content-type', 'cache-control', 'www-authenticate', 'set-cookie']) {
      const value = response.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    responseHeaders.set('access-control-allow-origin', '*');
    responseHeaders.set('access-control-allow-methods', 'GET, POST, DELETE, OPTIONS');
    responseHeaders.set('access-control-allow-headers', 'Content-Type, Authorization');

    const responseBody = await response.arrayBuffer();
    return new NextResponse(responseBody, { status: response.status, headers: responseHeaders });
  } catch (error) {
    console.error(`[MCP Proxy] Error forwarding to ${targetUrl}:`, error);
    return NextResponse.json(
      { error: 'proxy_error', error_description: 'Failed to connect to MCP server' },
      { status: 502 }
    );
  }
}

// ─── Route Handlers ────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const subpath = getSubpath(request);

  // OAuth metadata — served directly with per-tenant URLs
  if (subpath === '/.well-known/oauth-authorization-server') {
    return serveAuthorizationServerMetadata(request);
  }
  if (subpath === '/.well-known/oauth-protected-resource') {
    return serveProtectedResourceMetadata(request);
  }

  return proxyToMcp(request, subpath);
}

export async function POST(request: NextRequest) {
  const subpath = getSubpath(request);

  // CLI token auth — handled in-process (validates API token, then proxies)
  if (subpath === '/cli') {
    return handleCliRequest(request);
  }

  return proxyToMcp(request, subpath);
}

export async function DELETE(request: NextRequest) {
  return proxyToMcp(request, getSubpath(request));
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  });
}
