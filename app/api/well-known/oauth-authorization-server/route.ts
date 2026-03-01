import { NextRequest, NextResponse } from 'next/server';

/**
 * RFC 9728 OAuth Authorization Server Metadata
 * Rewritten from /.well-known/oauth-authorization-server/api/mcp
 */
export async function GET(request: NextRequest) {
  const proto = request.headers.get('x-forwarded-proto') || 'https';
  const host = request.headers.get('host') || 'localhost:3000';
  const origin = `${proto}://${host}`;
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
