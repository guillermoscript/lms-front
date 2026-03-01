import { createClient } from '@/lib/supabase/server';
import { getUserRole } from '@/lib/supabase/get-user-role';
import { mcpLimiter } from '@/lib/rate-limit';
import { NextRequest, NextResponse } from 'next/server';

const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'http://127.0.0.1:3001';
const MCP_PROXY_SECRET = process.env.MCP_PROXY_SECRET;

if (!MCP_PROXY_SECRET) {
  console.error('Warning: MCP_PROXY_SECRET not configured');
}

/**
 * MCP Proxy API Route
 * 
 * This endpoint proxies MCP protocol requests to the internal MCP server.
 * It handles authentication, authorization, and rate limiting.
 * 
 * Flow:
 * 1. Authenticate user via Supabase session
 * 2. Verify user has teacher or admin role
 * 3. Apply rate limiting (100 req/min per user)
 * 4. Forward request to MCP server with user context
 * 5. Return MCP server response
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate user
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { 
          jsonrpc: '2.0',
          error: {
            code: -32001,
            message: 'Unauthorized: Please log in to use the MCP server'
          }
        },
        { status: 401 }
      );
    }

    // 2. Get user role and verify authorization
    const role = await getUserRole();
    
    if (!role || (role !== 'teacher' && role !== 'admin')) {
      return NextResponse.json(
        { 
          jsonrpc: '2.0',
          error: {
            code: -32002,
            message: `Forbidden: MCP access requires teacher or admin role (current: ${role || 'none'})`
          }
        },
        { status: 403 }
      );
    }

    // 3. Apply rate limiting
    try {
      await mcpLimiter.check(100, user.id); // 100 requests per minute
    } catch {
      return NextResponse.json(
        { 
          jsonrpc: '2.0',
          error: {
            code: -32003,
            message: 'Rate limit exceeded (100 req/min). Please try again later.'
          }
        },
        { status: 429 }
      );
    }

    // 4. Parse and validate JSON-RPC request
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          jsonrpc: '2.0',
          error: {
            code: -32700,
            message: 'Parse error: Invalid JSON'
          }
        },
        { status: 400 }
      );
    }
    
    if (!body.jsonrpc || !body.method || body.jsonrpc !== '2.0') {
      return NextResponse.json(
        {
          jsonrpc: '2.0',
          id: body.id || null,
          error: {
            code: -32600,
            message: 'Invalid Request: Must be JSON-RPC 2.0 format'
          }
        },
        { status: 400 }
      );
    }

    // 5. Forward to MCP server with user context
    const tenantId = request.headers.get('x-tenant-id') || '00000000-0000-0000-0000-000000000001';

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      'X-User-ID': user.id,
      'X-User-Role': role,
      'X-Tenant-ID': tenantId,
    };

    // Add secret if configured
    if (MCP_PROXY_SECRET) {
      headers['X-MCP-Secret'] = MCP_PROXY_SECRET;
    }

    const mcpResponse = await fetch(`${MCP_SERVER_URL}/mcp`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    // 6. Handle MCP server errors
    if (!mcpResponse.ok) {
      let errorDetails = 'Unknown error';
      try {
        const errorJson = await mcpResponse.json();
        errorDetails = errorJson.error?.message || errorJson.error || JSON.stringify(errorJson);
      } catch {
        errorDetails = await mcpResponse.text();
      }
      
      console.error(`[MCP Proxy] Server error (${mcpResponse.status}):`, errorDetails);
      
      return NextResponse.json(
        {
          jsonrpc: '2.0',
          id: body.id || null,
          error: {
            code: -32004,
            message: 'MCP server error',
            data: errorDetails
          }
        },
        { status: 502 }
      );
    }

    // 7. Return successful MCP response
    const result = await mcpResponse.json();
    return NextResponse.json(result);

  } catch (error) {
    console.error('[MCP Proxy] Unexpected error:', error);
    
    return NextResponse.json(
      { 
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal error',
          data: error instanceof Error ? error.message : String(error)
        }
      },
      { status: 500 }
    );
  }
}

/**
 * Handle CORS preflight requests
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400', // 24 hours
    },
  });
}
