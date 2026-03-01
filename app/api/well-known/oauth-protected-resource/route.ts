import { NextRequest, NextResponse } from 'next/server';

/**
 * RFC 9728 OAuth Protected Resource Metadata
 * Rewritten from /.well-known/oauth-protected-resource/api/mcp
 */
export async function GET(request: NextRequest) {
  const proto = request.headers.get('x-forwarded-proto') || 'https';
  const host = request.headers.get('host') || 'localhost:3000';
  const origin = `${proto}://${host}`;
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
