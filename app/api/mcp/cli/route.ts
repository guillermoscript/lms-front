import { createClient } from '@/lib/supabase/server';
import { mcpLimiter } from '@/lib/rate-limit';
import { NextRequest, NextResponse } from 'next/server';

const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'http://127.0.0.1:3001';
const MCP_PROXY_SECRET = process.env.MCP_PROXY_SECRET;

if (!MCP_PROXY_SECRET) {
  console.error('Warning: MCP_PROXY_SECRET not configured');
}

/**
 * MCP CLI Proxy API Route
 * 
 * This endpoint allows CLI tools (like OpenCode) to access the MCP server
 * using bearer token authentication instead of session cookies.
 * 
 * Flow:
 * 1. Extract bearer token from Authorization header
 * 2. Validate token and get user info from database
 * 3. Verify user has teacher or admin role
 * 4. Apply rate limiting (100 req/min per user)
 * 5. Forward request to MCP server with user context
 * 6. Return MCP server response
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Extract bearer token
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { 
          jsonrpc: '2.0',
          error: {
            code: -32001,
            message: 'Unauthorized: Missing or invalid Authorization header. Use: Authorization: Bearer <token>'
          }
        },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // 2. Validate token using service role client
    const supabase = await createClient();
    
    const { data: tokenData, error: tokenError } = await supabase
      .rpc('validate_mcp_api_token', { token_input: token });

    if (tokenError || !tokenData || tokenData.length === 0) {
      return NextResponse.json(
        { 
          jsonrpc: '2.0',
          error: {
            code: -32001,
            message: 'Unauthorized: Invalid, expired, or revoked API token'
          }
        },
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
        { 
          jsonrpc: '2.0',
          error: {
            code: -32002,
            message: `Forbidden: MCP access requires teacher or admin role (current: ${userRole})`
          }
        },
        { status: 403 }
      );
    }

    // 4. Apply rate limiting
    try {
      await mcpLimiter.check(100, userId); // 100 requests per minute
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

    // 5. Parse and validate JSON-RPC request
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

    // 6. Update token last used (fire and forget - don't block the request)
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0] || 
                     request.headers.get('x-real-ip') || 
                     '127.0.0.1';
    
    // Update token usage in background (non-blocking)
    Promise.resolve().then(async () => {
      try {
        await supabase.rpc('update_token_last_used', { 
          token_id_input: tokenId,
          ip_input: clientIp
        });
      } catch {
        // Ignore errors - token tracking is non-critical
      }
    });

    // 7. Forward to MCP server with user context
    const tenantId = request.headers.get('x-tenant-id') || '00000000-0000-0000-0000-000000000001';

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      'X-User-ID': userId,
      'X-User-Role': userRole,
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

    // 8. Handle MCP server errors
    if (!mcpResponse.ok) {
      let errorDetails = 'Unknown error';
      try {
        const errorJson = await mcpResponse.json();
        errorDetails = errorJson.error?.message || errorJson.error || JSON.stringify(errorJson);
      } catch {
        errorDetails = await mcpResponse.text();
      }
      
      console.error(`[MCP CLI Proxy] Server error (${mcpResponse.status}):`, errorDetails);
      
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

    // 9. Return successful MCP response
    const result = await mcpResponse.json();
    return NextResponse.json(result);

  } catch (error) {
    console.error('[MCP CLI Proxy] Unexpected error:', error);
    
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
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400', // 24 hours
    },
  });
}
