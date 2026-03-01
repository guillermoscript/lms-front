/**
 * JWT Token Generator for MCP OAuth Server
 *
 * Signs and verifies self-issued access tokens using HS256.
 * These tokens are issued by our OAuth server (not Supabase)
 * and verified on every MCP request.
 */

import { SignJWT, jwtVerify, type JWTPayload } from "jose";

const MCP_JWT_SECRET = process.env.MCP_JWT_SECRET;

if (!MCP_JWT_SECRET) {
  console.error("[TokenGenerator] Warning: MCP_JWT_SECRET not set");
}

const secret = new TextEncoder().encode(MCP_JWT_SECRET || "dev-secret-change-me");

export interface AccessTokenClaims {
  sub: string; // user UUID
  role: "teacher" | "admin";
  tenant_id: string;
  client_id: string;
  scope: string;
}

export interface DecodedAccessToken extends JWTPayload {
  sub: string;
  role: "teacher" | "admin";
  tenant_id: string;
  client_id: string;
  scope: string;
}

/**
 * Sign a JWT access token with the given claims.
 * Token expires in 1 hour.
 */
export async function signAccessToken(claims: AccessTokenClaims): Promise<string> {
  return new SignJWT({
    role: claims.role,
    tenant_id: claims.tenant_id,
    client_id: claims.client_id,
    scope: claims.scope,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime("1h")
    .setIssuer("lms-mcp-server")
    .sign(secret);
}

/**
 * Verify and decode a JWT access token.
 * Throws if token is invalid or expired.
 */
export async function verifyAccessToken(token: string): Promise<DecodedAccessToken> {
  const { payload } = await jwtVerify(token, secret, {
    issuer: "lms-mcp-server",
  });

  const claims = payload as DecodedAccessToken;

  if (!claims.sub) {
    throw new Error("JWT missing sub claim");
  }
  if (!claims.role) {
    throw new Error("JWT missing role claim");
  }

  return claims;
}

/**
 * Sign a refresh token. Expires in 30 days.
 */
export async function signRefreshToken(claims: Pick<AccessTokenClaims, "sub" | "client_id">): Promise<string> {
  return new SignJWT({
    client_id: claims.client_id,
    type: "refresh",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime("30d")
    .setIssuer("lms-mcp-server")
    .sign(secret);
}

/**
 * Verify a refresh token.
 */
export async function verifyRefreshToken(token: string): Promise<{ sub: string; client_id: string }> {
  const { payload } = await jwtVerify(token, secret, {
    issuer: "lms-mcp-server",
  });

  if (!payload.sub) {
    throw new Error("Refresh token missing sub claim");
  }

  return {
    sub: payload.sub,
    client_id: (payload as any).client_id || "unknown",
  };
}
