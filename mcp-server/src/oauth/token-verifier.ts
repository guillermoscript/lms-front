/**
 * JWKS-based JWT Token Verifier for Supabase OAuth 2.1
 *
 * Verifies Supabase-issued JWTs using the JWKS endpoint,
 * extracts user_role from custom JWT claims (injected by custom_access_token_hook),
 * and returns AuthInfo for the MCP SDK's requireBearerAuth middleware.
 */

import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { OAuthTokenVerifier } from "@modelcontextprotocol/sdk/server/auth/provider.js";

export interface TokenVerifierConfig {
  /** Supabase project URL, e.g. http://127.0.0.1:54321 */
  supabaseUrl: string;
  /** Expected JWT audience (defaults to "authenticated") */
  audience?: string;
  /** Expected JWT issuer (defaults to supabaseUrl + /auth/v1) */
  issuer?: string;
}

interface SupabaseJWTClaims extends JWTPayload {
  sub: string;
  user_role?: string;
  role?: string;
  email?: string;
  app_metadata?: {
    user_role?: string;
  };
  /** OAuth client_id that requested the token */
  client_id?: string;
  /** Scopes granted */
  scope?: string;
}

export class SupabaseTokenVerifier implements OAuthTokenVerifier {
  private jwks: ReturnType<typeof createRemoteJWKSet>;
  private audience: string;
  private issuer: string;

  constructor(private config: TokenVerifierConfig) {
    const jwksUrl = new URL(`${config.supabaseUrl}/auth/v1/.well-known/jwks.json`);
    this.jwks = createRemoteJWKSet(jwksUrl);
    this.audience = config.audience ?? "authenticated";
    this.issuer = config.issuer ?? `${config.supabaseUrl}/auth/v1`;
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const { payload } = await jwtVerify(token, this.jwks, {
      audience: this.audience,
      issuer: this.issuer,
    });

    const claims = payload as SupabaseJWTClaims;

    if (!claims.sub) {
      throw new Error("JWT missing sub claim");
    }

    // Extract user_role from JWT claims
    // custom_access_token_hook injects user_role at top level
    const userRole =
      claims.user_role ||
      claims.app_metadata?.user_role ||
      claims.role ||
      "student";

    // Only teachers and admins can use the MCP server
    if (userRole !== "teacher" && userRole !== "admin") {
      throw new Error(
        `Access denied: role '${userRole}' cannot use the LMS MCP server. Only teachers and admins are allowed.`
      );
    }

    // Parse scopes from space-separated string
    const scopes = claims.scope ? claims.scope.split(" ") : [];

    return {
      token,
      clientId: claims.client_id || "unknown",
      scopes,
      expiresAt: claims.exp,
      extra: {
        userId: claims.sub,
        userRole,
        email: claims.email,
      },
    };
  }
}
