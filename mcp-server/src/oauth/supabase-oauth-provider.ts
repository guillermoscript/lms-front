/**
 * Supabase-backed OAuth 2.1 Server Provider for MCP (Multi-Tenant)
 *
 * Implements the OAuthServerProvider interface from the MCP SDK.
 * Uses Supabase Auth for user identity and issues self-signed JWTs
 * as access tokens.
 *
 * Multi-tenant design:
 * - The Next.js proxy serves OAuth metadata directly (per-tenant URLs)
 * - authorize() reads X-Origin header from the proxy to construct the
 *   consent page URL on the correct tenant subdomain
 * - No hardcoded domain — works for any tenant automatically
 *
 * Flow:
 * 1. Claude Desktop discovers auth via well-known metadata (served by proxy)
 * 2. Dynamic Client Registration stores client in memory
 * 3. authorize() redirects to tenant's consent page (origin from request)
 * 4. User logs in via Supabase Auth, approves consent
 * 5. Consent page POSTs to /api/mcp/auth/callback (same origin)
 * 6. Proxy forwards to MCP server, which generates auth code + redirects
 * 7. Client exchanges code for JWT access token
 * 8. JWT verified on every MCP request
 */

import { randomUUID } from "node:crypto";
import type { Response } from "express";
import type { OAuthServerProvider, AuthorizationParams } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import type {
  OAuthClientInformationFull,
  OAuthTokens,
  OAuthTokenRevocationRequest,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import {
  signAccessToken,
  verifyAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "./token-generator.js";

// ─── In-Memory Stores ───────────────────────────────────────────────────────

interface PendingAuth {
  client: OAuthClientInformationFull;
  params: AuthorizationParams;
}

interface AuthCodeData {
  clientId: string;
  userId: string;
  userRole: "teacher" | "admin";
  tenantId: string;
  scopes: string[];
  codeChallenge: string;
  redirectUri: string;
  resource?: URL;
  expiresAt: number;
}

interface RefreshTokenData {
  userId: string;
  userRole: "teacher" | "admin";
  tenantId: string;
  clientId: string;
  scopes: string[];
}

// ─── Clients Store ──────────────────────────────────────────────────────────

class InMemoryClientsStore implements OAuthRegisteredClientsStore {
  private clients = new Map<string, OAuthClientInformationFull>();

  async getClient(clientId: string): Promise<OAuthClientInformationFull | undefined> {
    return this.clients.get(clientId);
  }

  async registerClient(
    client: Omit<OAuthClientInformationFull, "client_id" | "client_id_issued_at">
  ): Promise<OAuthClientInformationFull> {
    const fullClient: OAuthClientInformationFull = {
      ...client,
      client_id: `mcp_${randomUUID().replace(/-/g, "")}`,
      client_id_issued_at: Math.floor(Date.now() / 1000),
    } as OAuthClientInformationFull;

    this.clients.set(fullClient.client_id, fullClient);
    console.error(`[OAuth] Registered client: ${fullClient.client_id} (${fullClient.client_name || "unnamed"})`);
    return fullClient;
  }
}

// ─── OAuth Server Provider ──────────────────────────────────────────────────

export class SupabaseOAuthProvider implements OAuthServerProvider {
  readonly clientsStore: InMemoryClientsStore;

  /** Pending authorization sessions (sessionId → PendingAuth) */
  private pendingAuths = new Map<string, PendingAuth>();

  /** Authorization codes (code → AuthCodeData) */
  private authCodes = new Map<string, AuthCodeData>();

  /** Refresh tokens (token → RefreshTokenData) */
  private refreshTokens = new Map<string, RefreshTokenData>();

  constructor() {
    this.clientsStore = new InMemoryClientsStore();

    // Periodically clean up expired entries (every 5 minutes)
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  /**
   * Begins the authorization flow by redirecting to the tenant's consent page.
   *
   * Reads X-Origin header (set by the Next.js proxy) to know which tenant
   * subdomain to redirect to. This makes it work for any tenant:
   *   school1.preciopana.com → consent page on school1.preciopana.com
   *   school2.preciopana.com → consent page on school2.preciopana.com
   */
  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response
  ): Promise<void> {
    const sessionId = randomUUID();

    // Store pending auth
    this.pendingAuths.set(sessionId, { client, params });

    // Clean up after 10 minutes if not completed
    setTimeout(() => {
      this.pendingAuths.delete(sessionId);
    }, 10 * 60 * 1000);

    // Read the tenant origin from the proxy-forwarded header.
    // In Express, res.req gives access to the incoming request.
    const origin = res.req?.headers["x-origin"] as string | undefined;
    const baseUrl = origin || "http://localhost:3000";

    // Build consent page URL on the tenant's subdomain
    const consentUrl = new URL(`/en/oauth/mcp-authorize`, baseUrl);
    consentUrl.searchParams.set("session_id", sessionId);
    if (client.client_name) {
      consentUrl.searchParams.set("client_name", client.client_name);
    }
    if (params.scopes?.length) {
      consentUrl.searchParams.set("scope", params.scopes.join(" "));
    }

    console.error(`[OAuth] Redirecting to consent page: ${consentUrl.toString()}`);
    res.redirect(consentUrl.toString());
  }

  /**
   * Returns the PKCE code_challenge for a given authorization code.
   */
  async challengeForAuthorizationCode(
    _client: OAuthClientInformationFull,
    authorizationCode: string
  ): Promise<string> {
    const codeData = this.authCodes.get(authorizationCode);
    if (!codeData) {
      throw new Error("Invalid authorization code");
    }
    return codeData.codeChallenge;
  }

  /**
   * Exchanges an authorization code for access + refresh tokens.
   */
  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string,
    _redirectUri?: string,
    _resource?: URL
  ): Promise<OAuthTokens> {
    const codeData = this.authCodes.get(authorizationCode);
    if (!codeData) {
      throw new Error("Invalid authorization code");
    }

    if (codeData.clientId !== client.client_id) {
      throw new Error("Authorization code was not issued to this client");
    }

    if (codeData.expiresAt < Date.now()) {
      this.authCodes.delete(authorizationCode);
      throw new Error("Authorization code has expired");
    }

    // Delete the code (single use)
    this.authCodes.delete(authorizationCode);

    // Generate access token (JWT)
    const accessToken = await signAccessToken({
      sub: codeData.userId,
      role: codeData.userRole,
      tenant_id: codeData.tenantId,
      client_id: client.client_id,
      scope: codeData.scopes.join(" "),
    });

    // Generate refresh token (JWT)
    const refreshToken = await signRefreshToken({
      sub: codeData.userId,
      client_id: client.client_id,
    });

    // Store refresh token data for future exchanges
    this.refreshTokens.set(refreshToken, {
      userId: codeData.userId,
      userRole: codeData.userRole,
      tenantId: codeData.tenantId,
      clientId: client.client_id,
      scopes: codeData.scopes,
    });

    console.error(
      `[OAuth] Issued tokens for user ${codeData.userId} (${codeData.userRole}) tenant ${codeData.tenantId} via client ${client.client_id}`
    );

    return {
      access_token: accessToken,
      token_type: "bearer",
      expires_in: 3600,
      refresh_token: refreshToken,
      scope: codeData.scopes.join(" "),
    };
  }

  /**
   * Exchanges a refresh token for a new access token.
   */
  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
    _scopes?: string[],
    _resource?: URL
  ): Promise<OAuthTokens> {
    // Verify the refresh token JWT
    let decoded;
    try {
      decoded = await verifyRefreshToken(refreshToken);
    } catch {
      const storedData = this.refreshTokens.get(refreshToken);
      if (!storedData) {
        throw new Error("Invalid refresh token");
      }
      decoded = { sub: storedData.userId, client_id: storedData.clientId };
    }

    const tokenData = this.refreshTokens.get(refreshToken);
    if (!tokenData) {
      throw new Error("Refresh token not found or revoked");
    }

    if (tokenData.clientId !== client.client_id) {
      throw new Error("Refresh token was not issued to this client");
    }

    // Issue new access token
    const newAccessToken = await signAccessToken({
      sub: tokenData.userId,
      role: tokenData.userRole,
      tenant_id: tokenData.tenantId,
      client_id: client.client_id,
      scope: tokenData.scopes.join(" "),
    });

    // Issue new refresh token (rotate)
    const newRefreshToken = await signRefreshToken({
      sub: decoded.sub,
      client_id: client.client_id,
    });

    // Rotate: delete old, store new
    this.refreshTokens.delete(refreshToken);
    this.refreshTokens.set(newRefreshToken, tokenData);

    return {
      access_token: newAccessToken,
      token_type: "bearer",
      expires_in: 3600,
      refresh_token: newRefreshToken,
      scope: tokenData.scopes.join(" "),
    };
  }

  /**
   * Verifies a self-signed JWT access token.
   */
  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const claims = await verifyAccessToken(token);

    return {
      token,
      clientId: claims.client_id || "unknown",
      scopes: claims.scope ? claims.scope.split(" ") : [],
      expiresAt: claims.exp,
      extra: {
        userId: claims.sub,
        userRole: claims.role,
        tenantId: claims.tenant_id,
      },
    };
  }

  /**
   * Revoke an access or refresh token.
   */
  async revokeToken(
    _client: OAuthClientInformationFull,
    request: OAuthTokenRevocationRequest
  ): Promise<void> {
    if (this.refreshTokens.has(request.token)) {
      this.refreshTokens.delete(request.token);
      console.error(`[OAuth] Revoked refresh token`);
    }
  }

  // ─── Callback handling (called from /auth/callback endpoint) ────────────

  /**
   * Get a pending authorization session.
   */
  getPendingAuth(sessionId: string): PendingAuth | undefined {
    return this.pendingAuths.get(sessionId);
  }

  /**
   * Complete an authorization by generating an auth code.
   * Called from the /auth/callback endpoint after user consent.
   */
  completeAuthorization(
    sessionId: string,
    userId: string,
    userRole: "teacher" | "admin",
    tenantId: string
  ): { code: string; redirectUri: string; state?: string } {
    const pending = this.pendingAuths.get(sessionId);
    if (!pending) {
      throw new Error("Invalid or expired session");
    }

    const code = randomUUID();

    this.authCodes.set(code, {
      clientId: pending.client.client_id,
      userId,
      userRole,
      tenantId,
      scopes: pending.params.scopes || ["mcp:tools"],
      codeChallenge: pending.params.codeChallenge,
      redirectUri: pending.params.redirectUri,
      resource: pending.params.resource,
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
    });

    this.pendingAuths.delete(sessionId);

    console.error(
      `[OAuth] Auth code issued for user ${userId} (${userRole}), tenant ${tenantId}, client ${pending.client.client_id}`
    );

    return {
      code,
      redirectUri: pending.params.redirectUri,
      state: pending.params.state,
    };
  }

  /**
   * Clean up expired entries.
   */
  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [code, data] of this.authCodes) {
      if (data.expiresAt < now) {
        this.authCodes.delete(code);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.error(`[OAuth] Cleaned up ${cleaned} expired auth codes`);
    }
  }
}
